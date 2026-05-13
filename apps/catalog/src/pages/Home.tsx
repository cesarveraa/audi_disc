import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  MapPin,
  PackageCheck,
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import type { CatalogPageProps } from '../app/App';
import { ProductCard } from '../components/ProductCard';
import { SiteNav } from '../components/SiteNav';
import { business } from '../config/business';
import { SEOHandler } from '../seo/SEOHandler';
import { faqJsonLd, localBusinessJsonLd } from '../seo/structuredData';
import { heroImage, storeImage } from '../utils/catalog';

const brands = ['JBL', 'Sony', 'Ewtto', 'Casio'];

const features = [
  {
    title: 'Stock inmediato',
    text: 'Sin esperas desde el eje central.',
    icon: PackageCheck,
  },
  {
    title: 'Garantía local',
    text: 'Atención directa en Chuquisaca.',
    icon: ShieldCheck,
  },
  {
    title: 'Originalidad 100%',
    text: 'Productos verificados en tienda.',
    icon: BadgeCheck,
  },
];

const faqEntries = [
  {
    question: '¿Tienen garantía?',
    answer:
      'Sí. Los productos originales vendidos por Audi Disc cuentan con respaldo local y atención directa en Sucre.',
  },
  {
    question: '¿Hacen entregas a domicilio en Sucre?',
    answer:
      'Sí. Puedes consultar por WhatsApp la zona de entrega, horarios disponibles y coordinación para recibir tu producto.',
  },
  {
    question: '¿Qué marcas manejan?',
    answer:
      'Trabajamos con marcas como JBL, Sony, Ewtto, Casio y otras líneas de audio, electrónica y accesorios.',
  },
];

const testimonials = [
  {
    name: 'Cliente Audi Disc',
    text: 'Me ayudaron a elegir el parlante correcto y pude consultar todo por WhatsApp antes de pasar por tienda.',
  },
  {
    name: 'Compra local en Sucre',
    text: 'La garantía local da mucha confianza. No tuve que esperar envíos desde otra ciudad.',
  },
  {
    name: 'Cliente frecuente',
    text: 'Buen asesoramiento técnico, precios claros y productos listos para llevar.',
  },
];

const reveal = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

export default function Home({ products, loadState }: CatalogPageProps) {
  const featuredProducts = products.slice(0, 4);
  const mapSrc = `https://www.google.com/maps?q=${business.latitude},${business.longitude}&z=16&output=embed`;

  return (
    <div className="min-h-screen bg-catalog-bg text-catalog-text">
      <SEOHandler
        title="Audi Disc Sucre | Sonido original con garantía real"
        description="Audi Disc Sucre ofrece audio, electrónica y accesorios originales con garantía local en Chuquisaca y consulta directa por WhatsApp."
        image={heroImage}
        canonical="/"
        jsonLd={[localBusinessJsonLd(), faqJsonLd(faqEntries)]}
      />

      <SiteNav variant="transparent" />

      <main>
        <section className="relative isolate flex min-h-[92vh] items-end overflow-hidden">
          <img
            src={heroImage}
            alt="Equipos de audio originales en Audi Disc Sucre"
            className="absolute inset-0 -z-20 h-full w-full object-cover"
            loading="eager"
          />
          <div className="absolute inset-0 -z-10 bg-black/70" />
          <div className="absolute inset-x-0 bottom-0 -z-10 h-64 bg-gradient-to-t from-catalog-bg via-catalog-bg/80 to-transparent" />

          <motion.div
            className="mx-auto w-full max-w-7xl px-4 pb-16 pt-28 sm:px-6 lg:px-8 lg:pb-20"
            initial="hidden"
            animate="visible"
            variants={reveal}
            transition={{ duration: 0.62, ease: 'easeOut' }}
          >
            <div className="max-w-4xl">
              <span className="inline-flex items-center gap-2 rounded-lg border border-audi-red/40 bg-audi-red/10 px-3 py-1.5 text-sm font-semibold text-white">
                <Sparkles className="h-4 w-4 text-audi-red" />
                Audi Red Edition
              </span>
              <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-tight text-white sm:text-6xl lg:text-7xl">
                Sonido Original con Garantía Real en Sucre
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-white/70 sm:text-lg">
                Catálogo público de audio, electrónica y accesorios con consulta directa en tienda local.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/productos"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-audi-red px-5 text-sm font-semibold text-white shadow-red transition hover:bg-audi-redDark"
                >
                  Ver productos
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#ubicacion"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/20 px-5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
                >
                  <MapPin className="h-4 w-4 text-audi-red" />
                  Ubicación en Sucre
                </a>
              </div>
            </div>
          </motion.div>
        </section>

        <motion.section
          className="border-y border-white/10 bg-catalog-panel"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.35 }}
          variants={reveal}
          transition={{ duration: 0.5 }}
        >
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 py-6 sm:grid-cols-4 sm:px-6 lg:px-8">
            {brands.map(brand => (
              <div
                key={brand}
                className="flex h-16 items-center justify-center rounded-lg text-xl font-semibold text-white/40 grayscale transition hover:text-white/70"
              >
                {brand}
              </div>
            ))}
          </div>
        </motion.section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <motion.div
            className="max-w-2xl"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={reveal}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm font-semibold uppercase text-audi-red">Diferencial Sucre</p>
            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-5xl">
              Compra técnica con respaldo local.
            </h2>
          </motion.div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.article
                  key={feature.title}
                  className="rounded-lg border border-white/10 bg-catalog-card p-6 shadow-card"
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.3 }}
                  variants={reveal}
                  transition={{ duration: 0.5, delay: index * 0.06 }}
                >
                  <Icon className="h-7 w-7 text-audi-red" />
                  <h3 className="mt-5 text-xl font-semibold text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-catalog-muted">{feature.text}</p>
                </motion.article>
              );
            })}
          </div>
        </section>

        <section className="bg-catalog-panel py-16 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
            <motion.div
              className="overflow-hidden rounded-lg border border-white/10 bg-catalog-card shadow-card"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={reveal}
              transition={{ duration: 0.5 }}
            >
              <img
                src={storeImage}
                alt="Atención en tienda Audi Disc Sucre"
                className="h-full min-h-[320px] w-full object-cover"
                loading="lazy"
              />
            </motion.div>
            <motion.div
              className="flex flex-col justify-center"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={reveal}
              transition={{ duration: 0.5, delay: 0.08 }}
            >
              <p className="text-sm font-semibold uppercase text-audi-red">Historia</p>
              <h2 className="mt-3 text-3xl font-semibold text-white sm:text-5xl">
                Tecnología con trato de tienda local.
              </h2>
              <p className="mt-5 text-base leading-8 text-catalog-muted">
                Audi Disc crece desde Sucre con una idea simple: que comprar audio y accesorios sea una experiencia clara,
                cercana y respaldada. El catálogo web acerca el stock disponible, pero la confianza se sostiene con
                asesoramiento real y respuesta directa en Chuquisaca.
              </p>
            </motion.div>
          </div>
        </section>

        <section className="bg-catalog-panel py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                variants={reveal}
                transition={{ duration: 0.5 }}
              >
                <p className="text-sm font-semibold uppercase text-audi-red">Nuevos Ingresos</p>
                <h2 className="mt-3 text-3xl font-semibold text-white sm:text-5xl">Lo más reciente en tienda.</h2>
              </motion.div>
              <Link
                to="/productos"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-white transition hover:border-audi-red hover:bg-audi-red"
              >
                Explorar todo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {loadState === 'loading' && (
              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-80 animate-pulse rounded-lg border border-white/10 bg-catalog-card" />
                ))}
              </div>
            )}

            {!!featuredProducts.length && (
              <div className="mt-8 flex snap-x gap-5 overflow-x-auto pb-4">
                {featuredProducts.map(product => (
                  <div key={product.id} className="min-w-[280px] max-w-[320px] snap-start sm:min-w-[320px]">
                    <ProductCard product={product} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <motion.div
            className="max-w-2xl"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={reveal}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm font-semibold uppercase text-audi-red">Clientes</p>
            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-5xl">
              Lo que dicen nuestros clientes.
            </h2>
          </motion.div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {testimonials.map((testimonial, index) => (
              <motion.article
                key={testimonial.name}
                className="rounded-lg border border-white/10 bg-catalog-card p-6 shadow-card"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                variants={reveal}
                transition={{ duration: 0.5, delay: index * 0.06 }}
              >
                <div className="flex items-center justify-between">
                  <Quote className="h-6 w-6 text-audi-red" />
                  <div className="flex gap-1 text-audi-red">
                    {Array.from({ length: 5 }).map((_, starIndex) => (
                      <Star key={starIndex} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                </div>
                <p className="mt-5 text-sm leading-6 text-catalog-muted">{testimonial.text}</p>
                <strong className="mt-5 block text-sm text-white">{testimonial.name}</strong>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="bg-catalog-panel py-16 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={reveal}
              transition={{ duration: 0.5 }}
            >
              <p className="text-sm font-semibold uppercase text-audi-red">FAQ</p>
              <h2 className="mt-3 text-3xl font-semibold text-white sm:text-5xl">
                Preguntas frecuentes.
              </h2>
              <p className="mt-5 text-base leading-7 text-catalog-muted">
                Respuestas rápidas para comprar con seguridad desde Sucre.
              </p>
            </motion.div>

            <motion.div
              className="space-y-3"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={reveal}
              transition={{ duration: 0.5, delay: 0.08 }}
            >
              {faqEntries.map(entry => (
                <details
                  key={entry.question}
                  className="group rounded-lg border border-white/10 bg-catalog-card p-5 shadow-card"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-white">
                    {entry.question}
                    <ChevronDown className="h-5 w-5 shrink-0 text-audi-red transition group-open:rotate-180" />
                  </summary>
                  <p className="mt-4 text-sm leading-6 text-catalog-muted">{entry.answer}</p>
                </details>
              ))}
            </motion.div>
          </div>
        </section>

        <section id="ubicacion" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-stretch">
            <motion.div
              className="flex flex-col justify-center"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={reveal}
              transition={{ duration: 0.5 }}
            >
              <p className="text-sm font-semibold uppercase text-audi-red">Ubicación</p>
              <h2 className="mt-3 text-3xl font-semibold text-white sm:text-5xl">Audi Disc en Sucre.</h2>
              <div className="mt-6 space-y-3 text-base leading-7 text-catalog-muted">
                <p>{business.streetAddress}</p>
                <p>
                  {business.city}, {business.region}, Bolivia
                </p>
                <p>{business.openingHours}</p>
                <p>{business.phone}</p>
              </div>
            </motion.div>

            <motion.div
              className="min-h-[320px] overflow-hidden rounded-lg border border-white/10 bg-catalog-card shadow-card"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={reveal}
              transition={{ duration: 0.5, delay: 0.08 }}
            >
              <iframe
                title="Mapa Audi Disc Sucre"
                src={mapSrc}
                className="h-full min-h-[320px] w-full border-0 opacity-80 grayscale invert"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </motion.div>
          </div>
        </section>
      </main>
    </div>
  );
}
