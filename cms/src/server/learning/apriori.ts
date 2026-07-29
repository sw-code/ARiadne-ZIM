// One walk: the subtypes the user engaged with at least once.
export type Basket = { installId: string; subtypes: string[] };
// The antecedent is sorted alphabetically. Confidence is between 0 and 1.
export type AssociationRule = { antecedent: string[]; consequent: string; confidence: number };

const minimumSupportShare = 0.02;
const minimumConfidence = 0.5;
const maximumItemsetSize = 3;
// A rule seen in only a few installs could be the habit of those few people, however many walks they made.
const minimumInstallsPerItemset = 10;
const ruleBoostWeight = 0.3;

type Itemset = string[]; // sorted alphabetically, so that every itemset has one spelling
type FrequentItemset = { items: Itemset; basketCount: number };
type CountableBasket = { installId: string; subtypes: Set<string> };

const keyOf = (items: Itemset): string => JSON.stringify(items);

function frequentAmong(candidates: Itemset[], baskets: CountableBasket[]): FrequentItemset[] {
  return candidates.flatMap((items) => {
    const basketsWithItems = baskets.filter(({ subtypes }) => items.every((item) => subtypes.has(item)));
    const installCount = new Set(basketsWithItems.map(({ installId }) => installId)).size;
    const isFrequent =
      basketsWithItems.length / baskets.length >= minimumSupportShare && installCount >= minimumInstallsPerItemset;
    return isFrequent ? [{ items, basketCount: basketsWithItems.length }] : [];
  });
}

// An itemset can only be frequent if all its subsets are, so candidates one item larger are built from the frequent
// ones and dropped as soon as one of their subsets is not frequent. Every candidate adds an item that sorts after its
// others, which builds each of them exactly once.
function largerCandidates(frequentItemsets: FrequentItemset[], frequentItems: string[]): Itemset[] {
  const frequentKeys = new Set(frequentItemsets.map(({ items }) => keyOf(items)));
  return frequentItemsets.flatMap(({ items }) =>
    frequentItems
      .filter((item) => items.every((existingItem) => existingItem < item))
      .map((item) => [...items, item])
      .filter((candidate) =>
        candidate.every((_, omittedIndex) =>
          frequentKeys.has(keyOf(candidate.filter((_, index) => index !== omittedIndex))),
        ),
      ),
  );
}

// Level-wise Apriori: all frequent itemsets of one size, then of the next, up to the maximum size.
function frequentItemsetsOf(baskets: CountableBasket[]): FrequentItemset[] {
  const subtypes = [...new Set(baskets.flatMap((basket) => [...basket.subtypes]))].sort();
  let level = frequentAmong(
    subtypes.map((subtype) => [subtype]),
    baskets,
  );
  const frequentItems = level.flatMap(({ items }) => items);
  const frequentItemsets = [...level];
  for (let size = 2; size <= maximumItemsetSize && level.length > 0; size++) {
    level = frequentAmong(largerCandidates(level, frequentItems), baskets);
    frequentItemsets.push(...level);
  }
  return frequentItemsets;
}

export function associationRules(baskets: Basket[]): AssociationRule[] {
  const countableBaskets = baskets.map(({ installId, subtypes }) => ({ installId, subtypes: new Set(subtypes) }));
  const frequentItemsets = frequentItemsetsOf(countableBaskets);
  const basketCountOfItemset = new Map(frequentItemsets.map(({ items, basketCount }) => [keyOf(items), basketCount]));

  return frequentItemsets
    .filter(({ items }) => items.length >= 2)
    .flatMap(({ items, basketCount }) =>
      items.flatMap((consequent) => {
        const antecedent = items.filter((item) => item !== consequent);
        const antecedentBasketCount = basketCountOfItemset.get(keyOf(antecedent));
        // Never missing, because every subset of a frequent itemset is frequent as well.
        if (antecedentBasketCount === undefined) return [];
        const confidence = basketCount / antecedentBasketCount;
        return confidence >= minimumConfidence ? [{ antecedent, consequent, confidence }] : [];
      }),
    );
}

// Only rules whose whole antecedent is among the user's top subtypes count: a rule about people who like a museum
// says nothing about a user who does not.
export function ruleBoost(subtype: string, topSubtypes: string[], rules: AssociationRule[]): number {
  const matchingConfidences = rules
    .filter(
      ({ antecedent, consequent }) => consequent === subtype && antecedent.every((item) => topSubtypes.includes(item)),
    )
    .map(({ confidence }) => confidence);
  return ruleBoostWeight * Math.max(0, ...matchingConfidences);
}
