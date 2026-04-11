export const processWikiCandidates = async (candidates: any[], roomId: string, userId: string, setStatus: (s: string) => void) => {
  return [];
};

export const archivist = {
  async processEntry(content: string) {
    // Здесь будет логика ИИ для обработки знаний
    return {
      title: 'Новая запись',
      category: 'lore',
      content: content
    };
  }
};
