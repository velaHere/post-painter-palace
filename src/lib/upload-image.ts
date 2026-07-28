import { api } from "./api-client";
import { getApiBaseUrl } from "./api-config";

export interface UploadedImage {
  imageName: string;
  url: string;
}

export async function uploadImage(file: File): Promise<UploadedImage> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api<{ imageName: string }>("/image", {
    method: "POST",
    auth: true,
    raw: true,
    body: fd,
  });
  return {
    imageName: res.imageName,
    url: `${getApiBaseUrl()}/image/${res.imageName}`,
  };
}

export function resolveImageSrc(nameOrUrl: string): string {
  if (!nameOrUrl) return "";
  if (/^https?:\/\//i.test(nameOrUrl) || nameOrUrl.startsWith("/")) {
    return nameOrUrl;
  }
  return `${getApiBaseUrl()}/image/${nameOrUrl}`;
}
