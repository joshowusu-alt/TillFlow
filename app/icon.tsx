import { ImageResponse } from 'next/og';
import { renderTillFlowAppIcon } from '@/lib/branding/app-icon';

export const runtime = 'edge';
export const contentType = 'image/png';
export const size = {
  width: 512,
  height: 512,
};

export default function Icon() {
  return new ImageResponse(renderTillFlowAppIcon(size.width), size);
}