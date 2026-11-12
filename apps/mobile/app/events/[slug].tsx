import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";

/** Website links (https://<site>/events/<slug>) open the event in the app. */
export default function EventLink() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <Redirect href={`/event/${slug}`} />;
}
