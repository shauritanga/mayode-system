import { Directory, File, Paths } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type LocalUpload = { uri: string; name: string; type: string };
export async function retainUpload(file: LocalUpload): Promise<LocalUpload> {
  const directory = new Directory(Paths.document, "field-uploads");
  directory.create({ idempotent: true, intermediates: true });
  if (file.uri.startsWith(directory.uri)) return file;
  const suffix =
    file.name
      .split(".")
      .pop()
      ?.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
  const target = new File(
    directory,
    `${Date.now()}-${Math.random().toString(36).slice(2)}.${suffix}`,
  );
  new File(file.uri).copy(target);
  const stored = { ...file, uri: target.uri };
  await AsyncStorage.setItem(
    `mayode.media.file.${target.uri}`,
    JSON.stringify(stored),
  );
  return stored;
}
export async function resolveMedia(
  data: any,
  owner: string,
  upload: (file: LocalUpload) => Promise<string>,
): Promise<any> {
  if (typeof data === "string" && /^(file|content):/.test(data)) {
    const cacheKey = `mayode.media.remote.${owner}.${data}`;
    const remote = await AsyncStorage.getItem(cacheKey);
    if (remote) return remote;
    const raw = await AsyncStorage.getItem(`mayode.media.file.${data}`);
    if (!raw)
      throw new Error("The saved photo is missing. Please select it again.");
    const url = await upload(JSON.parse(raw));
    await AsyncStorage.setItem(cacheKey, url);
    return url;
  }
  if (Array.isArray(data)) {
    const result = [];
    for (const value of data)
      result.push(await resolveMedia(value, owner, upload));
    return result;
  }
  if (data && typeof data === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data))
      result[key] = await resolveMedia(value, owner, upload);
    return result;
  }
  return data;
}
