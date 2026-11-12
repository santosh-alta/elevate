import { router } from "expo-router";
import React, { useState } from "react";
import { Text } from "react-native";
import { Api, User } from "../src/api";
import { useSession } from "../src/session";
import { STATUS_COLORS } from "../src/theme";
import { Button, Input, Muted, Screen, SectionHeader } from "../src/ui";

/** Edit my profile: contact, studies and the coding / social links shown to organisers and on certificates' LinkedIn posts. */
const LINKS: { key: keyof User; label: string; placeholder: string }[] = [
  { key: "linkedinUrl", label: "LinkedIn", placeholder: "https://linkedin.com/in/…" },
  { key: "githubUrl", label: "GitHub", placeholder: "https://github.com/…" },
  { key: "leetcodeUrl", label: "LeetCode", placeholder: "https://leetcode.com/u/…" },
  { key: "gfgUrl", label: "GeeksforGeeks", placeholder: "https://www.geeksforgeeks.org/user/…" },
  { key: "codechefUrl", label: "CodeChef", placeholder: "https://www.codechef.com/users/…" },
  { key: "hackerrankUrl", label: "HackerRank", placeholder: "https://www.hackerrank.com/profile/…" },
  { key: "codeforcesUrl", label: "Codeforces", placeholder: "https://codeforces.com/profile/…" },
  { key: "portfolioUrl", label: "Portfolio / website", placeholder: "https://…" },
];

export default function ProfileEditScreen() {
  const { user, refresh, theme } = useSession();
  const [v, setV] = useState<Partial<User>>(() => ({ ...user }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof User) => (t: string) => setV((x) => ({ ...x, [k]: t }));
  const str = (k: keyof User) => (v[k] == null ? "" : String(v[k]));

  const save = async () => {
    setBusy(true); setMsg(null);
    const clean = (s?: unknown) => (typeof s === "string" ? s.trim() || null : s ?? null);
    const year = str("graduationYear").trim();
    try {
      await Api.updateMe({
        name: String(v.name ?? "").trim() || user?.name, phone: clean(v.phone) as string | null, college: clean(v.college) as string | null,
        degree: clean(v.degree) as string | null, city: clean(v.city) as string | null, graduationYear: year ? Number(year) : null,
        ...Object.fromEntries(LINKS.map((l) => [l.key, clean(v[l.key])])),
      });
      await refresh();
      router.back();
    } catch (e: any) {
      setMsg(e?.message ?? "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      <SectionHeader>About you</SectionHeader>
      <Input label="Full name" value={str("name")} onChangeText={set("name")} autoComplete="name" />
      <Input label="Phone" value={str("phone")} onChangeText={set("phone")} keyboardType="phone-pad" autoComplete="tel" />
      <Input label="City" value={str("city")} onChangeText={set("city")} />
      <SectionHeader>Studies</SectionHeader>
      <Input label="College" value={str("college")} onChangeText={set("college")} />
      <Input label="Degree / programme" value={str("degree")} onChangeText={set("degree")} />
      <Input label="Graduation year" value={str("graduationYear")} onChangeText={set("graduationYear")} keyboardType="number-pad" maxLength={4} />
      <SectionHeader>Profiles</SectionHeader>
      <Muted style={{ marginBottom: 10, fontSize: 13 }}>Organisers and judges see these when you take part in events.</Muted>
      {LINKS.map((l) => (
        <Input key={l.key} label={l.label} value={str(l.key)} onChangeText={set(l.key)} placeholder={l.placeholder} autoCapitalize="none" keyboardType="url" autoCorrect={false} />
      ))}
      <Muted style={{ fontSize: 12, marginBottom: 12 }}>Your email ({user?.email}) can be changed on the website, under Profile.</Muted>
      {msg ? <Text style={{ color: STATUS_COLORS.danger, marginBottom: 8 }}>{msg}</Text> : null}
      <Button title="Save" icon="checkmark" size="lg" onPress={save} loading={busy} style={{ backgroundColor: theme.colors.primary }} />
    </Screen>
  );
}
