// src/lib/formats/index.ts
//
// The registry. Adding a tournament format means writing one engine and
// adding one line here — instead of hunting down five if/else chains in
// TournamentView (REVIEW-BACKLOG.md D2).

import type { TournamentFormat } from "../types";
import type { FormatEngine } from "./types";
import {
  roundRobinEngine,
  randomDoublesEngine,
  swissEngine,
  monradEngine,
  kingOfCourtEngine,
  waterfallEngine,
} from "./simpleFormats";
import {
  eliminationEngine,
  groupKoEngine,
  doubleEliminationEngine,
} from "./knockoutFormats";

export const FORMAT_ENGINES: Record<TournamentFormat, FormatEngine> = {
  round_robin: roundRobinEngine,
  elimination: eliminationEngine,
  random_doubles: randomDoublesEngine,
  group_ko: groupKoEngine,
  swiss: swissEngine,
  double_elimination: doubleEliminationEngine,
  monrad: monradEngine,
  king_of_court: kingOfCourtEngine,
  waterfall: waterfallEngine,
};

export function engineFor(format: TournamentFormat): FormatEngine {
  return FORMAT_ENGINES[format];
}

export type { FormatEngine, FormatContext, FormatPlan, FormatState } from "./types";
export { bracketToSpec, seedTeamsFrom, doubleEliminationState } from "./knockoutFormats";
