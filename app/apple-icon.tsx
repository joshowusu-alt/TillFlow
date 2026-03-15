import { ImageResponse } from 'next/og';
import { renderTillFlowAppIcon } from '@/lib/branding/app-icon';

export const runtime = 'edge';
export const contentType = 'image/png';
export const size = {
  width: 180,
  height: 180,
};

export default function AppleIcon() {
  return new ImageResponse(renderTillFlowAppIcon(size.width, 'apple'), size);
}