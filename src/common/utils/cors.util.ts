export function parseCorsOrigins(origins?: string) {
  return origins
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}
