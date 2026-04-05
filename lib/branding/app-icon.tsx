import React from 'react';

type IconVariant = 'default' | 'apple';

export function renderTillFlowAppIcon(size: number, variant: IconVariant = 'default') {
  const borderRadius = variant === 'apple' ? size * 0.225 : size * 0.21;

  return (
    <div
      style={{
        display: 'flex',
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: variant === 'apple'
          ? 'linear-gradient(160deg, #10b981 0%, #1E40AF 45%, #1e3a8a 100%)'
          : 'linear-gradient(135deg, #2563eb 0%, #1E40AF 52%, #1e3a8a 100%)',
        borderRadius,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: size * -0.12,
          background: 'radial-gradient(circle at top left, rgba(255,255,255,0.22), transparent 38%)',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: size * 0.028,
          transform: 'translateX(-7%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: size * 0.3,
            height: size * 0.13,
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.2)',
            borderRadius: size * 0.03,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.16)',
          }}
        >
          <span
            style={{
              color: '#ffffff',
              fontSize: size * 0.068,
              fontWeight: 800,
              letterSpacing: '-0.03em',
            }}
          >
            TF
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            width: size * 0.37,
            height: size * 0.23,
            background: 'rgba(255,255,255,0.96)',
            borderRadius: size * 0.04,
            padding: size * 0.026,
            gap: size * 0.018,
            boxShadow: '0 12px 28px rgba(15,23,42,0.12)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: size * 0.012,
              marginTop: size * 0.004,
            }}
          >
            {Array.from({ length: 2 }).map((_, rowIndex) => (
              <div
                key={rowIndex}
                style={{
                  display: 'flex',
                  gap: size * 0.012,
                }}
              >
                {Array.from({ length: 3 }).map((_, columnIndex) => {
                  const index = rowIndex * 3 + columnIndex;

                  return (
                    <div
                      key={index}
                      style={{
                        width: size * 0.052,
                        height: size * 0.046,
                        borderRadius: size * 0.012,
                        background: index === 5 ? '#cbd5e1' : '#dbe4f0',
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div
            style={{
              marginLeft: 'auto',
              width: size * 0.066,
              height: size * 0.12,
              borderRadius: size * 0.016,
              background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
            }}
          />
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: size * 0.15,
          display: 'flex',
          flexDirection: 'column',
          gap: size * 0.035,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ width: size * 0.13, height: size * 0.024, borderRadius: size * 0.03, background: 'rgba(255,255,255,0.88)' }} />
        <div style={{ width: size * 0.17, height: size * 0.024, borderRadius: size * 0.03, background: 'rgba(255,255,255,0.62)' }} />
        <div style={{ width: size * 0.11, height: size * 0.024, borderRadius: size * 0.03, background: 'rgba(255,255,255,0.35)' }} />
      </div>
    </div>
  );
}
