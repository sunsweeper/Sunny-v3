export type SolarPhoto = {
  src: string;
  filename: string;
  baseName: string;
  label?: "Before" | "After";
};

export type SolarPhotoGroup = {
  id: string;
  before?: SolarPhoto;
  after?: SolarPhoto;
  solo?: SolarPhoto;
};

const WATERMARKED_SOLAR_IMAGE_DIR = "/images/solar/watermarked";

const solarImageFiles = [
  "ag-after.jpg",
  "commercial-after.jpg",
  "commercial-before.jpg",
  "commercial3-after.jpg",
  "davis2-after.jpg",
  "davis2-before.jpg",
  "lom-after.jpg",
  "lom-before.jpg",
  "Orcutt-after.jpg",
  "paso-after.jpg",
  "Paso-after.jpg",
  "paso-before.jpg",
  "Paso-Before.jpg",
  "Paso-Before-2.jpg",
  "skylight-after.jpg",
  "skylight-before.jpg",
  "slo-after.jpg",
  "slo-before.jpg",
] as const;

const parseSolarPhoto = (filename: string): SolarPhoto => {
  const match = filename.match(/^(.*)-(before|after)\.(jpe?g|png)$/i);
  const baseName = match?.[1] ?? filename.replace(/\.(jpe?g|png)$/i, "");
  const label = match?.[2]?.toLowerCase() === "before" ? "Before" : match?.[2]?.toLowerCase() === "after" ? "After" : undefined;

  return {
    src: `${WATERMARKED_SOLAR_IMAGE_DIR}/${filename}`,
    filename,
    baseName,
    label,
  };
};

export const solarPhotos = solarImageFiles.map(parseSolarPhoto);

export const solarImagePaths = solarPhotos.map((photo) => photo.src);

export const solarPhotoGroups = solarPhotos.reduce<SolarPhotoGroup[]>((groups, photo) => {
  const pairableBaseName = photo.label ? photo.baseName : photo.filename;
  const existingGroup = groups.find((group) => group.id === pairableBaseName);
  const group = existingGroup ?? { id: pairableBaseName };

  if (photo.label === "Before") {
    group.before = photo;
  } else if (photo.label === "After") {
    group.after = photo;
  } else {
    group.solo = photo;
  }

  if (!existingGroup) groups.push(group);
  return groups;
}, []);

export const solarBeforeAfterGroups = solarPhotoGroups.filter((group) => group.before && group.after);

export const mobileSolarBeforeAfterGroups = solarBeforeAfterGroups.slice(0, 2);
