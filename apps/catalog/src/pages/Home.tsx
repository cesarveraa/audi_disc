import { motion, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  Headphones,
  MapPin,
  MessageCircle,
  PackageCheck,
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
  Volume2,
  WalletCards,
  Waves,
  Wrench,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import type { CatalogPageProps } from '../app/App';
import { ProductCard } from '../components/ProductCard';
import { SiteFooter } from '../components/SiteFooter';
import { SiteNav } from '../components/SiteNav';
import { whatsappHref } from '../components/WhatsAppButton';
import { business } from '../config/business';
import { SEOHandler } from '../seo/SEOHandler';
import { faqJsonLd, localBusinessJsonLd } from '../seo/structuredData';
import { heroImage, storeImage } from '../utils/catalog';

const brandLogos = ['SONY', 'JBL', 'EWTTO', 'CASIO'];

const worlds = [
  {
    brand: 'Sony',
    title: 'Elegancia y fidelidad',
    text: 'Audifonos y audio personal para escuchar con detalle, diseno sobrio y una experiencia premium desde Sucre.',
    image:
      'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=1600&q=86&fm=webp',
    icon: Headphones,
    tone: 'hover:border-sky-300/50 hover:bg-sky-500/[0.08]',
  },
  {
    brand: 'JBL',
    title: 'Energia y potencia',
    text: 'Parlantes con presencia, resistencia y sonido listo para reuniones, viajes y espacios abiertos en Chuquisaca.',
    image:
      'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1600&q=86&fm=webp',
    icon: Waves,
    tone: 'hover:border-orange-300/50 hover:bg-orange-500/[0.08]',
  },
  {
    brand: 'Ewtto',
    title: 'Versatilidad y tecnologia',
    text: 'Accesorios utiles, tecnologia diaria y excelente costo-beneficio para estudiar, trabajar y crear sin esperar envios.',
    image:
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1600&q=86&fm=webp',
    icon: Zap,
    tone: 'hover:border-emerald-300/50 hover:bg-emerald-500/[0.08]',
  },
];

const supportItems = [
  {
    title: 'Prueba de sonido en tienda',
    text: 'Ven a Calle Junin y escucha el producto antes de comprar.',
    icon: Volume2,
  },
  {
    title: 'Garantia oficial local',
    text: 'Respaldo directo en Sucre para productos originales Sony, JBL y lineas seleccionadas.',
    icon: ShieldCheck,
  },
  {
    title: 'Asesoria tecnica especializada',
    text: 'Te ayudamos a elegir potencia, conectividad y configuracion de audio segun tu uso.',
    icon: Wrench,
  },
];

const localProof = [
  {
    title: 'Stock inmediato',
    text: 'Compra hoy sin esperar envios del eje central.',
    icon: PackageCheck,
  },
  {
    title: 'Delivery en Sucre',
    text: 'Coordinacion local por WhatsApp segun zona y horario.',
    icon: Truck,
  },
  {
    title: 'Pagos flexibles',
    text: 'QR de bancos bolivianos, transferencia y efectivo en tienda.',
    icon: WalletCards,
  },
];

const faqEntries = [
  {
    question: 'Hacen delivery a domicilio en Sucre?',
    answer:
      'Si. Coordinamos entregas dentro de Sucre por WhatsApp segun zona, horario disponible y tipo de producto.',
  },
  {
    question: 'Que metodos de pago aceptan?',
    answer:
      'Aceptamos efectivo en tienda, transferencias bancarias y pagos por QR de bancos bolivianos. Las tarjetas dependen de disponibilidad operativa.',
  },
  {
    question: 'Los productos tienen garantia?',
    answer:
      'Si. Los productos originales vendidos por Audi Disc cuentan con respaldo local y atencion directa en Sucre.',
  },
  {
    question: 'Puedo probar audifonos o parlantes antes de comprar?',
    answer:
      'Si. Puedes visitar la tienda en Calle Junin para probar sonido, revisar compatibilidad y recibir asesoria tecnica.',
  },
  {
    question: 'Que marcas manejan en Audi Disc Sucre?',
    answer:
      'Trabajamos con Sony, JBL, Ewtto, Casio y otras lineas de audio, tecnologia y accesorios seleccionados.',
  },
];

const testimonials = [
  {
    name: 'Cliente Audi Disc',
    text: 'Me ayudaron a elegir el parlante correcto y pude consultar todo por WhatsApp antes de pasar por tienda.',
  },
  {
    name: 'Compra local en Sucre',
    text: 'La garantia local da mucha confianza. No tuve que esperar envios desde otra ciudad.',
  },
  {
    name: 'Cliente frecuente',
    text: 'Buen asesoramiento tecnico, precios claros y productos listos para llevar.',
  },
];

const reveal = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

export default function Home({ products, loadState }: CatalogPageProps) {
  const featuredProducts = products.slice(0, 8);
  const mapSrc = `https://www.google.com/maps?q=${business.latitude},${business.longitude}&z=16&output=embed`;
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 820], [0, 120]);
  const heroScale = useTransform(scrollY, [0, 820], [1.04, 1.14]);

  return (
    <div className="min-h-screen bg-catalog-bg text-white">
      <SEOHandler
        title="Audi Disc Sucre | Sony, JBL y tecnologia original en Chuquisaca"
        description="Audi Disc Sucre vende sonido, tecnologia y accesorios originales con stock inmediato, garantia local, delivery en Sucre y consulta por WhatsApp."
        image={heroImage}
        canonical="/"
        jsonLd={[localBusinessJsonLd(), faqJsonLd(faqEntries)]}
      />

      <SiteNav variant="transparent" />

      <main>
        <section className="relative isolate flex min-h-[96vh] items-end overflow-hidden">
          <motion.img
            src={heroImage}
            alt="Audio y tecnologia original en Audi Disc Sucre"
            className="absolute inset-0 -z-20 h-full w-full object-cover"
            loading="eager"
            style={{ y: heroY, scale: heroScale }}
          />
          <div className="absolute inset-0 -z-10 bg-black/70" />
          <div className="absolute inset-x-0 bottom-0 -z-10 h-80 bg-gradient-to-t from-catalog-bg via-catalog-bg/90 to-transparent" />

          <motion.div
            className="mx-auto w-full max-w-7xl px-4 pb-14 pt-32 sm:px-6 lg:px-8 lg:pb-20"
            initial="hidden"
            animate="visible"
            variants={reveal}
            transition={{ duration: 0.68, ease: 'easeOut' }}
          >
            <div className="max-w-5xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-xl">
                <Sparkles className="h-4 w-4 text-audi-red" />
                Audi Red Edition
              </span>
              <h1 className="mt-6 max-w-5xl text-4xl font-semibold leading-tight text-white sm:text-6xl lg:text-7xl">
                La Capital de la Tecnologia en Sucre: Sonido, Potencia y Garantia Original.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-white/75 sm:text-lg">
                No esperes envios del eje central; lo mejor de Sony, JBL y Ewtto esta hoy en tus manos.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/productos"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-audi-red px-6 text-sm font-semibold text-white shadow-red transition hover:-translate-y-0.5 hover:bg-audi-redDark"
                >
                  Ver Catalogo
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#ubicacion"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/[0.06] px-6 text-sm font-semibold text-white backdrop-blur-xl transition hover:border-white/40 hover:bg-white/10"
                >
                  <MapPin className="h-4 w-4 text-audi-red" />
                  Ubicacion en el Mapa
                </a>
                <a
                  href={whatsappHref()}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/20 px-6 text-sm font-semibold text-white transition hover:border-whatsapp hover:bg-whatsapp hover:text-black"
                >
                  <MessageCircle className="h-4 w-4" />
                  Consultar ahora
                </a>
              </div>
            </div>
          </motion.div>
        </section>

        <section aria-label="Marcas disponibles" className="border-y border-white/10 bg-[#080808]">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 py-5 sm:grid-cols-4 sm:px-6 lg:px-8">
            {brandLogos.map(brand => (
              <div
                key={brand}
                className="flex h-16 items-center justify-center rounded-2xl text-xl font-semibold tracking-[0.18em] text-white/40 grayscale transition hover:bg-white/[0.04] hover:text-white/70"
              >
                {brand}
              </div>
            ))}
          </div>
        </section>

        <section id="marcas" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <motion.div
            className="max-w-3xl"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={reveal}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-audi-red">Los Mundos de Audi Disc</p>
            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-5xl">
              Tres formas de vivir tecnologia con respaldo en Sucre.
            </h2>
          </motion.div>

          <div className="mt-10 grid gap-5">
            {worlds.map((world, index) => {
              const Icon = world.icon;
              const flipped = index % 2 === 1;
              return (
                <motion.article
                  key={world.brand}
                  className={[
                    'group grid overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] shadow-card backdrop-blur-xl transition duration-300 lg:grid-cols-2',
                    world.tone,
                  ].join(' ')}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.2 }}
                  variants={reveal}
                  transition={{ duration: 0.55, delay: index * 0.05 }}
                >
                  <div className={flipped ? 'relative min-h-[320px] lg:order-2' : 'relative min-h-[320px]'}>
                    <img
                      src={world.image}
                      alt={`Mundo ${world.brand} en Audi Disc Sucre`}
                      className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                  </div>
                  <div className="flex min-h-[320px] flex-col justify-center p-6 sm:p-10 lg:p-12">
                    <Icon className="h-9 w-9 text-audi-red" />
                    <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-audi-red">
                      Mundo {world.brand}
                    </p>
                    <h3 className="mt-3 text-3xl font-semibold text-white sm:text-5xl">{world.title}</h3>
                    <p className="mt-4 max-w-xl text-base leading-8 text-white/70">{world.text}</p>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </section>

        <section className="bg-audi-red py-16 text-white shadow-red lg:py-20" aria-labelledby="respaldo-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={reveal}
              transition={{ duration: 0.5 }}
            >
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-white/80">Respaldo Audi Disc</p>
                <h2 id="respaldo-heading" className="mt-3 text-3xl font-semibold sm:text-5xl">
                  Compra tecnologia con una tienda que responde en Sucre.
                </h2>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {supportItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <article key={item.title} className="rounded-2xl border border-white/25 bg-black/20 p-5 backdrop-blur-xl">
                      <Icon className="h-7 w-7" />
                      <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-white/80">{item.text}</p>
                    </article>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid gap-4 md:grid-cols-3">
            {localProof.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.article
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.045] p-6 shadow-card backdrop-blur-xl"
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.3 }}
                  variants={reveal}
                  transition={{ duration: 0.5, delay: index * 0.05 }}
                >
                  <Icon className="h-7 w-7 text-audi-red" />
                  <h3 className="mt-5 text-xl font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/70">{item.text}</p>
                </motion.article>
              );
            })}
          </div>
        </section>

        <section className="bg-[#080808] py-16 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
            <motion.div
              className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-card"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={reveal}
              transition={{ duration: 0.5 }}
            >
              <img
                src={storeImage}
                alt="Tienda fisica Audi Disc en Sucre"
                className="h-full min-h-[360px] w-full object-cover"
                loading="lazy"
              />
            </motion.div>
            <motion.article
              className="flex flex-col justify-center"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={reveal}
              transition={{ duration: 0.5, delay: 0.08 }}
            >
              <p className="text-sm font-semibold uppercase tracking-wide text-audi-red">Historia local</p>
              <h2 className="mt-3 text-3xl font-semibold text-white sm:text-5xl">
                Tecnologia premium con trato de tienda local.
              </h2>
              <p className="mt-5 text-base leading-8 text-white/70">
                Desde nuestra fundacion en Sucre, hemos servido a la comunidad chuquisaquena con lo mejor en tecnologia,
                audio original y accesorios confiables. Nuestro catalogo web acerca el stock disponible, pero la confianza
                se sostiene con asesoria real, prueba en tienda y respuesta directa en Chuquisaca.
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <span className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white">
                  <BadgeCheck className="h-4 w-4 text-audi-red" />
                  Originalidad verificada
                </span>
                <span className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white">
                  <MapPin className="h-4 w-4 text-audi-red" />
                  Atencion en Calle Junin
                </span>
              </div>
            </motion.article>
          </div>
        </section>

        <section id="nuevos-ingresos" className="bg-catalog-bg py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                variants={reveal}
                transition={{ duration: 0.5 }}
              >
                <p className="text-sm font-semibold uppercase tracking-wide text-audi-red">Nuevos Ingresos</p>
                <h2 className="mt-3 text-3xl font-semibold text-white sm:text-5xl">Recien llegado a Audi Disc.</h2>
              </motion.div>
              <Link
                to="/productos"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 px-5 text-sm font-semibold text-white transition hover:border-audi-red hover:bg-audi-red"
              >
                Explorar todo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {loadState === 'loading' && (
              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-96 animate-pulse rounded-2xl border border-white/10 bg-white/[0.05]" />
                ))}
              </div>
            )}

            {!!featuredProducts.length && (
              <div className="mt-8 flex snap-x gap-5 overflow-x-auto pb-4">
                {featuredProducts.map(product => (
                  <div key={product.id} className="min-w-[286px] max-w-[340px] snap-start sm:min-w-[320px]">
                    <ProductCard product={product} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="bg-[#080808] py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              className="max-w-2xl"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={reveal}
              transition={{ duration: 0.5 }}
            >
              <p className="text-sm font-semibold uppercase tracking-wide text-audi-red">Clientes</p>
              <h2 className="mt-3 text-3xl font-semibold text-white sm:text-5xl">
                Lo que dicen quienes compran local.
              </h2>
            </motion.div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {testimonials.map((testimonial, index) => (
                <motion.article
                  key={testimonial.name}
                  className="rounded-2xl border border-white/10 bg-white/[0.045] p-6 shadow-card backdrop-blur-xl"
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.3 }}
                  variants={reveal}
                  transition={{ duration: 0.5, delay: index * 0.05 }}
                >
                  <div className="flex items-center justify-between">
                    <Quote className="h-6 w-6 text-audi-red" />
                    <div className="flex gap-1 text-audi-red">
                      {Array.from({ length: 5 }).map((_, starIndex) => (
                        <Star key={starIndex} className="h-4 w-4 fill-current" />
                      ))}
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-white/70">{testimonial.text}</p>
                  <strong className="mt-5 block text-sm text-white">{testimonial.name}</strong>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={reveal}
              transition={{ duration: 0.5 }}
            >
              <p className="text-sm font-semibold uppercase tracking-wide text-audi-red">FAQ</p>
              <h2 className="mt-3 text-3xl font-semibold text-white sm:text-5xl">
                Preguntas frecuentes para comprar en Sucre.
              </h2>
              <p className="mt-5 text-base leading-7 text-white/70">
                Respuestas utiles sobre delivery, pagos, garantia y prueba de sonido en tienda.
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
                  className="group rounded-2xl border border-white/10 bg-white/[0.045] p-5 shadow-card backdrop-blur-xl"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-white">
                    {entry.question}
                    <ChevronDown className="h-5 w-5 shrink-0 text-audi-red transition group-open:rotate-180" />
                  </summary>
                  <p className="mt-4 text-sm leading-6 text-white/70">{entry.answer}</p>
                </details>
              ))}
            </motion.div>
          </div>
        </section>

        <section id="ubicacion" className="bg-[#080808] py-16 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.86fr_1.14fr] lg:px-8">
            <motion.article
              className="flex flex-col justify-center"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={reveal}
              transition={{ duration: 0.5 }}
            >
              <p className="text-sm font-semibold uppercase tracking-wide text-audi-red">Ubicacion</p>
              <h2 className="mt-3 text-3xl font-semibold text-white sm:text-5xl">Audi Disc en Sucre.</h2>
              <div className="mt-6 space-y-3 text-base leading-7 text-white/70">
                <p>{business.streetAddress}</p>
                <p>
                  {business.city}, {business.region}, Bolivia
                </p>
                <p>{business.openingHours}</p>
                <p>{business.phone}</p>
              </div>
            </motion.article>

            <motion.div
              className="min-h-[340px] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-card"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={reveal}
              transition={{ duration: 0.5, delay: 0.08 }}
            >
              <iframe
                title="Mapa Audi Disc Sucre"
                src={mapSrc}
                className="h-full min-h-[340px] w-full border-0 opacity-80 grayscale invert"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </motion.div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
