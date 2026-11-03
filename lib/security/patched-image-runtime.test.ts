// @vitest-environment node
import { expect, it } from 'vitest';
import sharp from 'sharp';

it('renders a controlled SVG through the patched native image pipeline', async () => {
  const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#123456"/></svg>')).png().toBuffer();
  expect(await sharp(png).metadata()).toMatchObject({ format: 'png', width: 2, height: 2 });
});
