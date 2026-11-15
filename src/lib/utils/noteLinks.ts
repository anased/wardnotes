/** Labeled links between notes and trials, read in both directions. */
import type { LinkEndpointType, LinkRelation } from '../supabase/types';

export const LINK_RELATIONS: LinkRelation[] = ['answers', 'supports', 'cites', 'critiques', 'illustrates', 'related'];

/** How a link reads from its source: "This note answers …". */
export const OUTGOING_LABELS: Record<LinkRelation, string> = {
  answers: 'Answers',
  supports: 'Supports',
  cites: 'Cites',
  critiques: 'Critiques',
  illustrates: 'Illustrates',
  related: 'Related to',
};

/** How the same link reads from its target: "… is answered by this note". */
export const INCOMING_LABELS: Record<LinkRelation, string> = {
  answers: 'Answered by',
  supports: 'Supported by',
  cites: 'Cited by',
  critiques: 'Critiqued by',
  illustrates: 'Illustrated by',
  related: 'Related to',
};

export function isLinkRelation(value: unknown): value is LinkRelation {
  return typeof value === 'string' && (LINK_RELATIONS as string[]).includes(value);
}

export interface Endpoint {
  type: LinkEndpointType;
  id: string;
}

export interface LinkRowLike {
  id: string;
  source_type: LinkEndpointType;
  source_id: string;
  target_type: LinkEndpointType;
  target_id: string;
  relation: LinkRelation;
}

export interface LinkView<L extends LinkRowLike = LinkRowLike> {
  link: L;
  direction: 'outgoing' | 'incoming';
  /** The other end of the link. */
  other: Endpoint;
  label: string;
}

const sameEndpoint = (type: LinkEndpointType, id: string, e: Endpoint) => type === e.type && id === e.id;

/**
 * Turns links touching `self` into readable rows, grouped by label in
 * relation order (outgoing before incoming). "related" links in either
 * direction share one "Related to" group.
 */
export function groupLinks<L extends LinkRowLike>(self: Endpoint, links: L[]): { label: string; items: LinkView<L>[] }[] {
  const views: LinkView<L>[] = [];
  for (const link of links) {
    if (sameEndpoint(link.source_type, link.source_id, self)) {
      views.push({ link, direction: 'outgoing', other: { type: link.target_type, id: link.target_id }, label: OUTGOING_LABELS[link.relation] });
    } else if (sameEndpoint(link.target_type, link.target_id, self)) {
      views.push({ link, direction: 'incoming', other: { type: link.source_type, id: link.source_id }, label: INCOMING_LABELS[link.relation] });
    }
  }
  const order = [
    ...LINK_RELATIONS.map((r) => OUTGOING_LABELS[r]),
    ...LINK_RELATIONS.map((r) => INCOMING_LABELS[r]),
  ].filter((label, i, all) => all.indexOf(label) === i);
  return order
    .map((label) => ({ label, items: views.filter((v) => v.label === label) }))
    .filter((g) => g.items.length > 0);
}

/** A link a form wants to exist (no id yet). */
export interface LinkDraft {
  relation: LinkRelation;
  target_type: LinkEndpointType;
  target_id: string;
}

export const draftKey = (d: LinkDraft) => `${d.relation}|${d.target_type}|${d.target_id}`;

/** What to create and delete so the outgoing links match `wanted`. */
export function diffOutgoingLinks<L extends LinkRowLike>(
  current: L[],
  wanted: LinkDraft[]
): { create: LinkDraft[]; remove: L[] } {
  const wantedKeys = new Set(wanted.map(draftKey));
  const currentKeys = new Set(current.map((l) => draftKey(l)));
  return {
    create: wanted.filter((d, i) => !currentKeys.has(draftKey(d)) && wanted.findIndex((x) => draftKey(x) === draftKey(d)) === i),
    remove: current.filter((l) => !wantedKeys.has(draftKey(l))),
  };
}
