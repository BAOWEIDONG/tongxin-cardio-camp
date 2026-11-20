export const motivationalQuotes = [
  '血压稳一点，身体轻一点。',
  '今天走够 30 分钟，就是给心脏的一份礼物。',
  '规律服药、低盐饮食、适量运动，缺一不可。',
  '慢一点没关系，坚持才是关键。',
  '每一次平稳的呼吸，都是心脏在谢谢你。',
  '别和数字较劲，和习惯做朋友。',
  '今天记下的血压，是明天方案的依据。',
  '少一勺盐，多一分安心。',
  '运动不是挑战极限，是找到适合自己的节奏。',
  '睡好觉，也是在保护心血管。',
  '身体的每一次改善，都值得被看见。',
  '按时随访，是对自己最负责的温柔。',
  '慢慢来，比较快。',
  '你今天的坚持，正在变成明天的底气。',
  '心率稳、血压稳、心情稳，就是好状态。',
  '不追求一步到位，只追求每天到位。',
  '走一走，动一动，让血管更有活力。',
  '吃得清淡一点，动得规律一点。',
  '健康不是终点，是每天的选择。',
  '21 天养成习惯，11 个月陪伴改变。',
  '把「我得运动」变成「我想动一动」。',
];

export function getTodayQuote(): string {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start.getTime()) / 86400000);
  return motivationalQuotes[dayOfYear % motivationalQuotes.length];
}
