// 黑苔32：冷铁、旧木、布旗和文书共用的显示色板。原素材保留，不覆盖作者文件。
export const ART_PALETTE = [
  '#121416', '#202426', '#353b3d', '#515a5b', '#798582', '#adb6aa', '#d9dcc7', '#f4edcf',
  '#241b17', '#403025', '#624635', '#886447', '#b88b60', '#dcba87', '#8b703d', '#c39e56',
  '#263527', '#3e5138', '#61724a', '#8d9b62', '#283a48', '#405f71', '#69919c', '#a5c2c7',
  '#422632', '#674254', '#997187', '#512b27', '#893d36', '#be6550', '#dd9563', '#edc47b',
] as const
const rgb = ART_PALETTE.map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)))
const nearest = new Map<number, readonly number[]>()

/** 只映射RGB，保留原始透明度。导入精灵和人物/UI预览走同一显示管线。 */
export function quantizeRgba(data: Uint8ClampedArray, liftShadows = false): void {
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue
    // DCSS部分地砖压在1–40亮度范围；先提亮暗部再收色，避免纹理全塌为黑。
    if (liftShadows) for (let channel = 0; channel < 3; channel++) data[i + channel] = Math.round(Math.sqrt(data[i + channel] / 255) * 255)
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
    let color = nearest.get(key)
    if (!color) {
      let distance = Infinity
      for (const candidate of rgb) {
        const d = 2 * (candidate[0] - data[i]) ** 2 + 3 * (candidate[1] - data[i + 1]) ** 2 + (candidate[2] - data[i + 2]) ** 2
        if (d < distance) { distance = d; color = candidate }
      }
      nearest.set(key, color!)
    }
    data.set(color!, i)
  }
}
