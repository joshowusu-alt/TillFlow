import type { ReactNode } from 'react';

export const PRODUCT_FORM_SECTION_TITLES = ['Essential', 'Stock and purchasing', 'Advanced'] as const;

type ProductFormSectionProps = {
  title: (typeof PRODUCT_FORM_SECTION_TITLES)[number];
  description?: string;
  children: ReactNode;
};

export default function ProductFormSection({ title, description, children }: ProductFormSectionProps) {
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
