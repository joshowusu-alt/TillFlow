/** QZ Tray is a desktop helper; touch-only tablets and phones use browser printing. */
export function supportsDesktopDirectPrint(device: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>, touchOnly = false) {
  return !/Android|iPhone|iPad|iPod|Windows Phone|Mobile|Tablet|Silk|Kindle/i.test(device.userAgent)
    && !(device.platform === 'MacIntel' && device.maxTouchPoints > 1)
    && !(device.maxTouchPoints > 0 && touchOnly);
}
