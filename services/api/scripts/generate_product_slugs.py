from __future__ import annotations

import argparse
import re
import unicodedata
from collections import Counter

from app.core.firebase import get_firestore_client


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value or "")
    ascii_text = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text.lower()).strip("-")
    return re.sub(r"-{2,}", "-", slug)


def generate_product_slug(nombre: str, marca: str | None = None, ciudad: str = "Sucre") -> str:
    name_slug = slugify(nombre)
    brand_slug = slugify(marca or "")
    city_slug = slugify(ciudad)
    parts = [name_slug]
    if brand_slug and brand_slug not in name_slug:
        parts.append(brand_slug)
    parts.append(city_slug)
    return "-".join(part for part in parts if part)


def unique_slug(base_slug: str, seen: Counter[str]) -> str:
    seen[base_slug] += 1
    if seen[base_slug] == 1:
        return base_slug
    return f"{base_slug}-{seen[base_slug]}"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Genera slugs SEO para productos de Audi Disc a partir del nombre, marca y ciudad."
    )
    parser.add_argument("--city", default="Sucre")
    parser.add_argument("--collection", default="productos")
    parser.add_argument("--field", default="slugUrl")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--commit", action="store_true", help="Escribe los slugs en Firestore.")
    args = parser.parse_args()

    db = get_firestore_client()
    query = db.collection(args.collection)
    if args.limit > 0:
        query = query.limit(args.limit)

    seen: Counter[str] = Counter()
    updates: list[tuple[str, str, str]] = []
    for snapshot in query.stream():
        data = snapshot.to_dict() or {}
        if not data.get("estado", True):
            continue
        base_slug = generate_product_slug(
            nombre=str(data.get("nombre", "")),
            marca=data.get("marca"),
            ciudad=args.city,
        )
        slug = unique_slug(base_slug, seen)
        updates.append((snapshot.id, str(data.get("nombre", "")), slug))

    for product_id, nombre, slug in updates:
        print(f"{product_id}\t{slug}\t{nombre}")
        if args.commit:
            db.collection(args.collection).document(product_id).update({args.field: slug})

    mode = "updated" if args.commit else "dry-run"
    print(f"{mode}: {len(updates)} slugs generated for {args.city}")


if __name__ == "__main__":
    main()
