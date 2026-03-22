// Shared in-memory document store
// Lives outside route files so Next.js doesn't complain about non-route exports

export const docStore: {
  chunks: Array<{ text: string; page: number; index: number }>
  filename: string
  hasImages: boolean
  fullText: string
  pageDescriptions: Array<{ page: number; text: string }>
} = {
  chunks: [],
  filename: '',
  hasImages: false,
  fullText: '',
  pageDescriptions: []
}
