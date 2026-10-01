import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { farmersApi } from "../lib/data";
import { useI18n } from "../i18n";

export function FarmerPerformance({ farmerId }: { farmerId: string }) {
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState(false);
  const { t } = useI18n();
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      let active = true;
      farmersApi
        .productionSummary(farmerId)
        .then((r) => {
          if (active) {
            setSummary(r.data);
            setError(false);
          }
        })
        .catch(() => {
          if (active) setError(true);
        });
      return () => {
        active = false;
      };
    }, [farmerId]),
  );
  return (
    <View
      style={{
        backgroundColor: "#fff",
        padding: 16,
        borderRadius: 14,
        marginVertical: 12,
        gap: 8,
      }}
    >
      <Text style={{ fontWeight: "800", fontSize: 17 }}>
        {t("performanceSummary")}
      </Text>
      {!summary ? (
        <Text>{error ? t("recordsUnavailable") : "…"}</Text>
      ) : (
        <>
          <Text>
            {t("totalYield")}:{" "}
            {Number(summary.totalActualYieldKg ?? 0).toLocaleString()} kg
          </Text>
          <Text>
            {t("totalCosts")}: TZS{" "}
            {Number(summary.totalCostsTzs ?? 0).toLocaleString()}
          </Text>
          {(summary.cycles ?? []).map((cycle: any) => (
            <TouchableOpacity
              key={cycle.id}
              onPress={() =>
                router.push({
                  pathname: "/crop-cycle/[id]",
                  params: { id: cycle.id },
                })
              }
              style={{
                paddingVertical: 10,
                borderTopWidth: 1,
                borderColor: "#E5E7EB",
              }}
            >
              <Text style={{ fontWeight: "700", color: "#047857" }}>
                {cycle.season} · {cycle.farmCode}
              </Text>
              <Text>
                {Number(cycle.actualYieldKg ?? 0).toLocaleString()} kg · TZS{" "}
                {Number(cycle.totalCostsTzs ?? 0).toLocaleString()}
              </Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </View>
  );
}
