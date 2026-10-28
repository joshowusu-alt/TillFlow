import { notFound } from 'next/navigation';
import SupplierStockPreview from './SupplierStockPreview';

export default function SupplierStockPreviewPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return <SupplierStockPreview />;
}
