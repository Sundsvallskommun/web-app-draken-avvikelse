import { countUnhandledMeasures, isUnhandledMeasure, undecidedProposalsMessage, unhandledMeasuresMessage } from '@/services/support-measure-closing';

const proposal = { id: 'a' };
const approvedPlanned = { id: 'b', accept: 'TRUE', plannedComplete: '2026-09-30T00:00:00Z' };
const followedUp = { ...approvedPlanned, id: 'c', executed: '2026-09-29T00:00:00Z', result: 'COMPLETED', resultText: 'Genomförd' };
const rejected = { id: 'd', accept: 'FALSE', acceptMotivation: 'Inte aktuell' };
const executedDirectly = { id: 'e', accept: 'TRUE', executed: '2026-09-20T00:00:00Z' };

describe('support-measure-closing', () => {
  describe('isUnhandledMeasure', () => {
    it('counts a measure nobody has decided on', () => {
      expect(isUnhandledMeasure(proposal)).toBe(true);
    });

    it('counts an approved planned measure that has not been followed up', () => {
      expect(isUnhandledMeasure(approvedPlanned)).toBe(true);
    });

    it('leaves a followed-up measure alone', () => {
      expect(isUnhandledMeasure(followedUp)).toBe(false);
    });

    // Carrying a planned measure out is not following it up: the follow-up tab still asks for its answers.
    it('counts a planned measure reported as carried out but not followed up', () => {
      expect(isUnhandledMeasure({ ...approvedPlanned, executed: '2026-09-29T00:00:00Z' })).toBe(true);
    });

    // Neither asks anything more of anybody: one was turned down, the other was already carried out.
    it('leaves a rejected measure and one registered as carried out alone', () => {
      expect(isUnhandledMeasure(rejected)).toBe(false);
      expect(isUnhandledMeasure(executedDirectly)).toBe(false);
    });

    // An approved measure with no dates is not in the follow-up flow at all.
    it('leaves an approved measure without a plan alone', () => {
      expect(isUnhandledMeasure({ id: 'f', accept: 'TRUE' })).toBe(false);
    });
  });

  describe('unhandledMeasuresMessage', () => {
    it('says nothing when every measure is handled', () => {
      expect(unhandledMeasuresMessage([followedUp, rejected, executedDirectly])).toBeUndefined();
      expect(unhandledMeasuresMessage([])).toBeUndefined();
    });

    it('names what is in the way, so the handler knows what to do next', () => {
      expect(unhandledMeasuresMessage([proposal, approvedPlanned, followedUp])).toBe(
        'Ärendet kan inte avslutas förrän alla åtgärder är hanterade: 1 åtgärd väntar på beslut och 1 åtgärd är inte uppföljd.',
      );
      expect(unhandledMeasuresMessage([proposal, { ...proposal, id: 'a2' }])).toBe(
        'Ärendet kan inte avslutas förrän alla åtgärder är hanterade: 2 åtgärder väntar på beslut.',
      );
      expect(unhandledMeasuresMessage([approvedPlanned, { ...approvedPlanned, id: 'b2' }])).toBe(
        'Ärendet kan inte avslutas förrän alla åtgärder är hanterade: 2 åtgärder är inte uppföljda.',
      );
    });

    it('counts the two kinds apart', () => {
      expect(countUnhandledMeasures([proposal, approvedPlanned, followedUp, rejected])).toEqual({ undecided: 1, unfollowed: 1 });
    });
  });

  // Ä13. The follow-up follows up what was approved, so the errand waits for every proposal to be decided.
  describe('undecidedProposalsMessage', () => {
    it('says how many proposals wait, and what has to happen to them', () => {
      expect(undecidedProposalsMessage([proposal, { ...proposal, id: 'a2' }, approvedPlanned])).toBe(
        'Ärendet kan inte gå vidare till uppföljning förrän alla åtgärdsförslag är bedömda: 2 förslag väntar på att godkännas, delvis godkännas eller avslås.',
      );
    });

    // A measure that is approved and not yet followed up is exactly what the follow-up is for.
    it('says nothing once every proposal is decided, whatever is left to follow up', () => {
      expect(undecidedProposalsMessage([approvedPlanned, rejected, followedUp, executedDirectly])).toBeUndefined();
      expect(undecidedProposalsMessage([])).toBeUndefined();
    });
  });
});
