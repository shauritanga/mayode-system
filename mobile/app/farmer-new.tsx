import React, { useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  Button,
  Alert,
  Switch,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { farmersApi, workspaceApi } from "../src/lib/data";
import { normalizePhone } from "../src/lib/phone";
import { useI18n } from "../src/i18n";
import { SearchableSelect } from "../src/components/SearchableSelect";
import { getRegions, getDistricts, getWards } from "../src/local/locations";

export default function FarmerNew() {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    password: "",
    region: "",
    district: "",
    ward: "",
    village: "",
  });
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const save = async () => {
    if (
      Object.values(form).some((v) => !v.trim()) ||
      form.password.length < 6 ||
      !/^\+255\d{9}$/.test(normalizePhone(form.phone))
    ) {
      Alert.alert(t("validationError"), t("farmerRegistrationRequired"));
      return;
    }
    setSaving(true);
    try {
      const context = await workspaceApi.context().catch(() => ({ data: {} as any }));
      const result = await farmersApi.create({
        ...form,
        phone: normalizePhone(form.phone),
        dataShareConsent: consent,
        mamcosId: context.data?.mamcos?.id,
      });
      Alert.alert(
        t("registerFarmer"),
        t(result.data.queued ? "savedOffline" : "farmerRegistered"),
        [
          {
            text: "OK",
            onPress: () =>
              router.replace({
                pathname: "/officer/farmer/[id]",
                params: { id: result.data.id },
              }),
          },
        ],
      );
    } catch (e: any) {
      Alert.alert(
        t("error"),
        e?.response?.data?.message?.toString() || e.message,
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Stack.Screen
        options={{ title: t("registerFarmer"), headerShown: true }}
      />
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        {(["firstName", "lastName", "phone", "password"] as const).map(
          (key) => (
            <View key={key}>
              <Text>{t(key === "phone" ? "phoneNumber" : key)}</Text>
              <TextInput
                value={form[key]}
                onChangeText={(v) => set(key, v)}
                secureTextEntry={key === "password"}
                keyboardType={key === "phone" ? "phone-pad" : "default"}
                autoCapitalize={key === "password" ? "none" : "words"}
                style={{
                  backgroundColor: "#fff",
                  padding: 14,
                  borderRadius: 10,
                }}
              />
            </View>
          ),
        )}
        <SearchableSelect
          label={t("region")}
          value={form.region}
          options={getRegions()}
          onSelect={(v) =>
            setForm((f) => ({ ...f, region: v, district: "", ward: "" }))
          }
          searchable
        />
        <SearchableSelect
          label={t("district")}
          value={form.district}
          options={getDistricts(form.region)}
          onSelect={(v) => setForm((f) => ({ ...f, district: v, ward: "" }))}
          searchable
        />
        <SearchableSelect
          label={t("ward")}
          value={form.ward}
          options={getWards(form.region, form.district)}
          onSelect={(v) => set("ward", v)}
          searchable
        />
        <Text>{t("village")}</Text>
        <TextInput
          value={form.village}
          onChangeText={(v) => set("village", v)}
          style={{ backgroundColor: "#fff", padding: 14, borderRadius: 10 }}
        />
        <Text>{t("farmerSharingConsent")}</Text>
        <Switch value={consent} onValueChange={setConsent} />
        <Button
          title={t(saving ? "saving" : "registerFarmer")}
          disabled={saving}
          onPress={save}
        />
      </ScrollView>
    </>
  );
}
