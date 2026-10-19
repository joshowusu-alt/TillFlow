import type { ReactNode } from 'react';

export const PRODUCT_FORM_SECTION_TITLES = ['Essential', 'Product details', 'Stock and purchasing', 'Advanced'] as const;

type ProductFormSectionProps = {
  title: (typeof PRODUCT_FORM_SECTION_TITLES)[number];
  description?: string;
  children: ReactNode;
};

export default function ProductFormSection({ title, description, children }: ProductFormSectionProps) {
  if (title !== 'Essential') return <details className="md:col-span-3 rounded-xl border border-black/10 p-4" data-product-form-section={title}><summary className="cursor-pointer text-sm font-semibold">{title}<span className="ml-2 text-xs font-normal text-black/50">Optional</span></summary>{description ? <p className="mt-2 text-xs text-black/55">{description}</p> : null}<div className="mt-4 grid gap-4 md:grid-cols-3">{children}</div></details>;
  return (
    <section className="md:col-span-3 space-y-3" data-product-form-section={title}>
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-black/55">{description}</p> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-3">{children}</div>
    </section>
  );
}
