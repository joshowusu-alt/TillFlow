'use client';

import { useState } from 'react';

interface Props {
  imageUrl: string;
  name: string;
}

export default function ProductHeroImage({ imageUrl, name }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="w-24 h-24 rounded-xl bg-accentSoft flex items-center justify-center text-3xl font-bold text-accent flex-shrink-0">
        {name.charAt(0)}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={name}
      className="w-24 h-24 rounded-xl object-cover flex-shrink-0"
      onError={() => setFailed(true)}
    />
  );
}
