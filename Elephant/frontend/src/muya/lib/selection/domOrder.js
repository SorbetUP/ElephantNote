export const compareParagraphsOrder = (paragraph1, paragraph2) => {
  return paragraph1.compareDocumentPosition(paragraph2) & Node.DOCUMENT_POSITION_FOLLOWING
}
