// Local, per-device judging drafts so a judge never loses marks if the app is closed mid-way.
// Stored as small JSON files in the app's document directory (localStorage on web), with an
// in-memory fallback if storage isn't available.
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { brand } from "./api";

export interface ScoreDraft {
  values: Record<string, number>;
  criterionComments: Record<string, string>;
  comment: string;
  tags: string[];
  recommend: boolean | null;
  updatedAt: string;
}

const memory = new Map<string, string>();

function keyFor(roundId: string, teamId: string) {
  return `judge-draft_${brand.slug}_${roundId}_${teamId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function fileFor(key: string): File {
  const dir = new Directory(Paths.document, "judge-drafts");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return new File(dir, `${key}.json`);
}

async function readRaw(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(key) ?? memory.get(key) ?? null;
    const f = fileFor(key);
    return f.exists ? await f.text() : (memory.get(key) ?? null);
  } catch {
    return memory.get(key) ?? null;
  }
}

async function writeRaw(key: string, value: string | null): Promise<void> {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (Platform.OS === "web") {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
      return;
    }
    const f = fileFor(key);
    if (value === null) {
      if (f.exists) f.delete();
    } else {
      if (!f.exists) f.create({ intermediates: true, overwrite: true });
      f.write(value);
    }
  } catch {
    // keep the in-memory copy
  }
}

export async function loadDraft(roundId: string, teamId: string): Promise<ScoreDraft | null> {
  const raw = await readRaw(keyFor(roundId, teamId));
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return {
      values: d.values ?? {},
      criterionComments: d.criterionComments ?? {},
      comment: d.comment ?? "",
      tags: Array.isArray(d.tags) ? d.tags : [],
      recommend: typeof d.recommend === "boolean" ? d.recommend : null,
      updatedAt: d.updatedAt ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveDraft(roundId: string, teamId: string, draft: Omit<ScoreDraft, "updatedAt">): Promise<void> {
  return writeRaw(keyFor(roundId, teamId), JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }));
}

export function clearDraft(roundId: string, teamId: string): Promise<void> {
  return writeRaw(keyFor(roundId, teamId), null);
}

/** Team ids in a round that have unsynced marks saved on this phone. */
export async function draftTeamIds(roundId: string, teamIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  await Promise.all(
    teamIds.map(async (id) => {
      if (await readRaw(keyFor(roundId, id))) out.add(id);
    }),
  );
  return out;
}
