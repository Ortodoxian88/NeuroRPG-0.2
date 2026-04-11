export const typingIndicators = [
  "ИИ размышляет...",
  "ИИ пишет...",
  "ИИ готовит ответ..."
];

export const indicators = {
  getHealthColor: (hp: number, max: number) => {
    const percent = (hp / max) * 100;
    if (percent > 70) return 'text-green-500';
    if (percent > 30) return 'text-yellow-500';
    return 'text-red-500';
  }
};
