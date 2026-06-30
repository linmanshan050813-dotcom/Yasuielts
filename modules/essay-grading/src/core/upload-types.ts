export const ESSAY_EXTENSIONS = [".txt", ".md", ".doc", ".docx", ".pdf"] as const;

export const QUESTION_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;

export const QUESTION_EXTENSIONS = [
  ...ESSAY_EXTENSIONS,
  ...QUESTION_IMAGE_EXTENSIONS,
] as const;

export type UploadPurpose = "essay" | "question";

const essaySet = new Set<string>(ESSAY_EXTENSIONS);
const questionSet = new Set<string>(QUESTION_EXTENSIONS);
const imageSet = new Set<string>(QUESTION_IMAGE_EXTENSIONS);

export function extensionOf(filename: string): string {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot) : "";
}

export function isEssayFilename(filename: string): boolean {
  return essaySet.has(extensionOf(filename));
}

export function isQuestionFilename(filename: string): boolean {
  return questionSet.has(extensionOf(filename));
}

export function isImageFilename(filename: string): boolean {
  return imageSet.has(extensionOf(filename));
}

export function isAllowedFilename(filename: string, purpose: UploadPurpose): boolean {
  return purpose === "essay" ? isEssayFilename(filename) : isQuestionFilename(filename);
}

export function allowedExtensionsFor(purpose: UploadPurpose): readonly string[] {
  return purpose === "essay" ? ESSAY_EXTENSIONS : QUESTION_EXTENSIONS;
}

export function formatExtensionList(extensions: readonly string[]): string {
  return extensions.join(" ");
}

export function acceptAttributeFor(purpose: UploadPurpose): string {
  return allowedExtensionsFor(purpose).join(",");
}

export function unsupportedFileMessage(purpose: UploadPurpose): string {
  const allowed = formatExtensionList(allowedExtensionsFor(purpose));
  if (purpose === "essay") {
    return `Unsupported file type. Essays accept only ${allowed}. Please upload a supported file.`;
  }
  return `Unsupported file type. Questions accept only ${allowed}. Please upload a supported file or chart image.`;
}
