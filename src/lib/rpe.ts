/** 心血管营统一使用 1–5 级自感用力（RPE），不使用 Borg 6–20 刻度。 */
export const RPE_PRESCRIPTION_OPTIONS = [
  { value: '1 级（很轻，能正常唱歌）', label: '1 级 · 很轻' },
  { value: '1–2 级（很轻至轻，可正常聊天）', label: '1–2 级 · 很轻至轻' },
  { value: '2 级（轻，可正常聊天）', label: '2 级 · 轻' },
  { value: '2–3 级（轻至中等，能完整说句子）', label: '2–3 级 · 轻至中等' },
  { value: '3 级（中等，微喘但能说短句）', label: '3 级 · 中等' },
  { value: '3–4 级（中等偏上，仅医师明确允许）', label: '3–4 级 · 中等偏上' },
  { value: '4 级（较强，仅医师明确允许）', label: '4 级 · 较强' },
] as const;

export const DEFAULT_CARDIO_RPE = '2–3 级（轻至中等，能完整说句子）';
export const RECOVERY_CARDIO_RPE = '1–2 级（很轻至轻，可正常聊天）';

/** 兼容旧演示数据：将误用的 Borg 6–20 文案迁移到五级 RPE。 */
export function normalizeRpeText(text: string): string {
  if (!text) return text;
  return text
    .replace(/RPE\s*11[–-]13/gi, 'RPE 2–3 级')
    .replace(/RPE\s*9[–-]11/gi, 'RPE 1–2 级')
    .replace(/11[–-]13/g, '2–3 级')
    .replace(/9[–-]11/g, '1–2 级')
    .replace(/RPE\s*13/g, 'RPE 3 级')
    .replace(/轻到稍累/g, '轻至中等，能完整说句子')
    .replace(/很轻到轻/g, '很轻至轻，可正常聊天');
}
