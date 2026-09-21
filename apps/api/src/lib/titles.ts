/** Connected's own title conventions, cleaned up on the way in. */

/**
 * Connected authors prefix a series' title with "SERIES:" (and the Spanish material with "SERIE:"),
 * in every casing and with or without the space: "SERIES: Equity Consultants", "SERIES:Self-Management",
 * "Series: School Marketing", "SERIE: Viaje de Inicio de una Escuela Wildflower".
 *
 * The prefix is noise on the page — a card already carries its own type tag — so it is taken off the
 * title as the item is indexed. A title that is nothing but the prefix is left alone rather than
 * emptied out.
 */
const SERIES_PREFIX = /^(series|serie)\s*:\s*/i;
export function stripSeriesPrefix(title: string): string {
  const stripped = title.replace(SERIES_PREFIX, "").trim();
  return stripped || title;
}
