import type { Poi, RankedPoi, RankingRequest } from "../../shared/api.ts";
import { distanceMetres } from "../../shared/GeoExtensions.ts";
import { interestOf, type PriorModel } from "./interest.ts";
import { isSensitive } from "./sensitiveSubtypes.ts";

const annotationBonus = 0.3;
const maxProfiledPoisPerResponse = 20;

// The walk may become this much longer, but never by less than the minimum: for a very short walk (start close to
// the destination) a share of the walk would leave no room for any place at all.
const detourBudgetShareOfDirectWalk = 0.25;
const minimumDetourBudgetMetres = 200;

// The app counts a destination within 25 m of a place as navigating to it, but sends the destination rounded to three
// decimals. That moves it by up to 55.6 m north-south and 34.6 m east-west at Soest's latitude, 66 m diagonally. So the
// places the app may match lie within 25 m + 66 m = 91 m of the destination received here, rounded up to 100 m.
// Such a place is always in the detour area: the detour through it is at most twice this distance, which is exactly
// the minimum detour budget, so lowering that budget would need this radius to shrink with it.
const destinationCandidateRadiusMetres = 100;

type Candidate = { poi: Poi; detourMetres: number; score: number };

const bestFirst = (a: Candidate, b: Candidate) => b.score - a.score || a.detourMetres - b.detourMetres;

const hasAnnotations = ({ annotations }: Poi) => annotations.length > 0;

// Annotated places are the editors' content, so all of them are returned however little the profile rates them. So are
// the places at the destination: the app counts a destination there as interest in the place, so it must be able to
// find it. The profile only fills up the rest, within a cap that keeps the response small.
export function rankPois(
  pois: Poi[],
  { start, destination, profile = {} }: RankingRequest,
  priorModel: PriorModel,
): RankedPoi[] {
  const directWalkMetres = distanceMetres(start, destination);
  const detourBudgetMetres = Math.max(detourBudgetShareOfDirectWalk * directWalkMetres, minimumDetourBudgetMetres);

  // Sensitive places never take part in profiling. An annotation is the one thing that still brings them in.
  const scoreOf = (poi: Poi) => {
    const interest = isSensitive(poi) ? 0 : interestOf(poi.subtype, profile, priorModel);
    return hasAnnotations(poi) ? annotationBonus + interest : interest;
  };

  const candidates = pois.flatMap((poi) => {
    const detourMetres = distanceMetres(start, poi) + distanceMetres(poi, destination) - directWalkMetres;
    return detourMetres <= detourBudgetMetres ? [{ poi, detourMetres, score: scoreOf(poi) }] : [];
  });

  const isAlwaysReturned = ({ poi }: Candidate) =>
    hasAnnotations(poi) || (distanceMetres(poi, destination) <= destinationCandidateRadiusMetres && !isSensitive(poi));

  const alwaysReturned = candidates.filter(isAlwaysReturned);
  const bestProfiled = candidates
    .filter((candidate) => !isAlwaysReturned(candidate) && !isSensitive(candidate.poi))
    .sort(bestFirst)
    .slice(0, maxProfiledPoisPerResponse);

  return [...alwaysReturned, ...bestProfiled].sort(bestFirst).map(({ poi, score }) => ({ ...poi, score }));
}
