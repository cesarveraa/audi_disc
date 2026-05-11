from __future__ import annotations

import argparse
import sys
from pathlib import Path

from firebase_admin import auth, firestore
from firebase_admin._auth_utils import ConfigurationNotFoundError

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.firebase import get_firestore_client, initialize_firebase  # noqa: E402
from app.core.security import ADMIN_ROLE, SELLER_ROLE  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Crea o actualiza usuarios Firebase Auth para Audi Disc.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--display-name", default="Audi Disc Admin")
    parser.add_argument("--role", choices=[ADMIN_ROLE, SELLER_ROLE], default=ADMIN_ROLE)
    parser.add_argument("--disabled", action="store_true")
    return parser.parse_args()


def upsert_user(email: str, password: str, display_name: str, role: str, disabled: bool) -> str:
    initialize_firebase()

    try:
        user = auth.get_user_by_email(email)
        auth.update_user(
            user.uid,
            password=password,
            display_name=display_name,
            disabled=disabled,
            email_verified=True,
        )
        action = "actualizado"
    except auth.UserNotFoundError:
        user = auth.create_user(
            email=email,
            password=password,
            display_name=display_name,
            disabled=disabled,
            email_verified=True,
        )
        action = "creado"

    auth.set_custom_user_claims(user.uid, {"role": role})
    db = get_firestore_client()
    db.collection("usuarios").document(user.uid).set(
        {
            "email": email,
            "displayName": display_name,
            "role": role,
            "estado": not disabled,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )
    print(f"Usuario {action}: {email}")
    print(f"UID: {user.uid}")
    print(f"Role claim: {role}")
    return user.uid


def main() -> None:
    args = parse_args()
    try:
        upsert_user(
            email=args.email,
            password=args.password,
            display_name=args.display_name,
            role=args.role,
            disabled=args.disabled,
        )
    except ConfigurationNotFoundError as exc:
        raise SystemExit(
            "Firebase Auth no esta habilitado para este proyecto. "
            "Abre Firebase Console > Authentication > Get started > Sign-in method "
            "y habilita Email/Password. Luego vuelve a ejecutar este script."
        ) from exc


if __name__ == "__main__":
    main()
