import {
  assets as closetAssets,
  tops as topsMetadata,
  bottoms as bottomsMetadata,
  shoes as shoesMetadata,
  face_acc as faceAccessoriesMetadata,
  body_acc as bodyAccessoriesMetadata,
  outfits as outfitsMetadata,
  costumes as costumesMetadata,
  body as bodyMetadata,
  heads as headsMetadata,
  avatar_parts as avatarPartsMetadata,
} from "../client/assets/data.js";

const BOARD_METADATA_PATH = "../client/assets/boards_metadata.json";
const SHOP_DATA_SOURCES = {
  le_shop: { label: "Le Shop", path: "../client/assets/le_shop.json" },
  jesters: { label: "Jesters", path: "../client/assets/jesters.json" },
  stellar_salon: { label: "Stellar Salon", path: "../client/assets/stellar-salon.json" },
  locoboards: { label: "Loco Boardz", path: "../client/assets/locoboards.json" },
};
const ASSET_BASE_PATH = "../client/";
const LOCAL_STORAGE_KEY = "fos-asset-editor-placements-v2";
const STAGE_SCALE_MIN = 0.5;
const STAGE_SCALE_MAX = 3;
const STAGE_SCALE_STEP = 0.25;

const ASSET_TRANSFORM_ORIGIN = "50% 50%";

const state = {
  gender: "female",
  bodyKey: null,
  boards: {},
  shopCatalogs: {},
  shopCatalogBaselines: {},
  assetIndex: [],
  assetIndexById: new Map(),
  shopAssignments: new Map(),
  baseLayers: new Map(),
  layers: [],
  selectedLayer: null,
  stageTransform: { x: 0, y: 0, scale: 1 },
  savedPlacements: loadSavedPlacements(),
  isGizmoDraggingEnabled: false,
};

const layerDragState = {
  sourceDisplayIndex: null,
  targetDisplayIndex: null,
};

const dom = {
  search: document.getElementById("asset-search"),
  categoryFilter: document.getElementById("category-filter"),
  shopFilter: document.getElementById("shop-filter"),
  assetList: document.getElementById("asset-list"),
  showGirl: document.getElementById("show-girl"),
  showBoy: document.getElementById("show-boy"),
  baseAvatar: document.getElementById("base-avatar"),
  stageContent: document.getElementById("stage-content"),
  basePartsContainer: document.getElementById("base-parts-container"),
  stage: document.getElementById("avatar-stage"),
  stageHint: document.getElementById("stage-hint"),
  layerContainer: document.getElementById("layer-container"),
  layersPanel: document.getElementById("layers-panel"),
  pivotHandle: document.getElementById("pivot-handle"),
  selectionPanel: document.getElementById("selection-details"),
  selectionTitle: document.getElementById("selection-title"),
  shopEditor: document.getElementById("shop-editor"),
  shopEditorRows: document.getElementById("shop-editor-rows"),
  inputX: document.getElementById("input-x"),
  inputY: document.getElementById("input-y"),
  resetPosition: document.getElementById("reset-position"),
  toggleGizmoDrag: document.getElementById("toggle-gizmo-drag"),
  removeLayer: document.getElementById("remove-layer"),
  saveLocal: document.getElementById("save-local"),
  generateMetadata: document.getElementById("generate-metadata"),
  zoomIn: document.getElementById("zoom-in"),
  zoomOut: document.getElementById("zoom-out"),
  zoomReset: document.getElementById("zoom-reset"),
  bodyCoords: document.getElementById("body-coords"),
  headCoords: document.getElementById("head-coords"),
};

[dom.stageContent, dom.layerContainer, dom.basePartsContainer, dom.baseAvatar].forEach((node) => {
  if (node?.style) {
    node.style.transformOrigin = ASSET_TRANSFORM_ORIGIN;
  }
});

function applyAssetTransformOrigin(node) {
  if (node?.style) {
    node.style.transformOrigin = ASSET_TRANSFORM_ORIGIN;
  }
}

function loadSavedPlacements() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Failed to read saved placements", err);
    return {};
  }
}

function persistPlacements() {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.savedPlacements));
}

function applyStageTransform() {
  if (!dom.stage) return;
  const { x, y } = state.stageTransform;
  dom.stage.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function applyStageScale() {
  if (!dom.stageContent) return;
  dom.stageContent.style.transform = `scale(${state.stageTransform.scale})`;
}

function setStageScale(scale) {
  const clamped = Math.min(STAGE_SCALE_MAX, Math.max(STAGE_SCALE_MIN, scale));
  state.stageTransform.scale = clamped;
  applyStageScale();
}

function adjustStageScale(delta) {
  setStageScale(state.stageTransform.scale + delta);
}

function resetStageScale() {
  setStageScale(1);
}

function normalizeMetadataPath(path, pathSegments = []) {
  if (!path || path.startsWith("assets/")) {
    return path;
  }

  const [category, ...rest] = pathSegments;
  const gender = rest[0];

  const isGendered = gender === "female" || gender === "male";

  switch (category) {
    case "outfits":
      if (isGendered) {
        return `assets/closet/outfits/${gender}/${path}`;
      }
      return `assets/closet/outfits/${path}`;
    case "costumes":
      if (isGendered) {
        return `assets/closet/costumes/${gender}/${path}`;
      }
      return `assets/closet/costumes/${path}`;
    case "face_acc":
    case "body_acc": {
      if (isGendered) {
        const subfolder = category === "face_acc" ? "face" : "body";
        return `assets/closet/acc/${gender}/${subfolder}/${path}`;
      }
      return `assets/closet/${category}/${path}`;
    }
    case "body":
    case "heads":
    case "avatar_parts":
      return `assets/${path}`;
    default:
      return path;
  }
}

function extractFrameDimensions(metadata = {}) {
  const width = typeof metadata.splitX === "number"
    ? metadata.splitX
    : typeof metadata.frameWidth === "number"
      ? metadata.frameWidth
      : null;
  const height = typeof metadata.splitY === "number"
    ? metadata.splitY
    : typeof metadata.frameHeight === "number"
      ? metadata.frameHeight
      : null;
  return { width, height };
}

function coerceNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getBoardPreviewFrames(metadata = {}) {
  const totalFrames = Math.max(1, Number(metadata.frames) || 1);
  const maxIndex = totalFrames - 1;

  const coerceIndex = (value) => {
    if (value == null || value === "") {
      return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return clamp(Math.floor(parsed), 0, maxIndex);
  };

  const firstFrame = 0;
  const lastFrame = maxIndex;

  if (!metadata.middleEffect) {
    const previewFrame = coerceIndex(metadata.previewFrame);
    return [previewFrame ?? firstFrame];
  }

  const explicitBottom = coerceIndex(metadata.middleEffectBottomFrame);
  const explicitTop = coerceIndex(metadata.middleEffectTopFrame);

  const rawLayerAbove = metadata.layerAbove;
  const isLayerAbove =
    rawLayerAbove === true ||
    rawLayerAbove === 1 ||
    rawLayerAbove === "1" ||
    (typeof rawLayerAbove === "string" && rawLayerAbove.toLowerCase() === "true");

  const defaultBottom = isLayerAbove ? firstFrame : lastFrame;
  const defaultTop = isLayerAbove ? lastFrame : firstFrame;

  const bottomFrame = explicitBottom ?? defaultBottom;
  const topFrame = explicitTop ?? defaultTop;

  if (bottomFrame === topFrame) {
    return [bottomFrame];
  }

  // Draw the back layer first so the top layer overlays it, matching avatar.js behaviour.
  return [bottomFrame, topFrame];
}

function createBoardLayerElement(entry, assetUrl, className) {
  const framesToDraw = getBoardPreviewFrames(entry.metadata);
  if (!framesToDraw.length || framesToDraw.length === 1 || !entry.frameWidth || !entry.frameHeight) {
    return null;
  }

  const ratio = window.devicePixelRatio || 1;
  const wrapper = document.createElement("div");
  wrapper.className = className;
  wrapper.style.position = "relative";
  wrapper.style.width = `${entry.frameWidth}px`;
  wrapper.style.height = `${entry.frameHeight}px`;
  applyAssetTransformOrigin(wrapper);

  const canvases = framesToDraw.map(() => {
    const canvas = document.createElement("canvas");
    canvas.width = entry.frameWidth * ratio;
    canvas.height = entry.frameHeight * ratio;
    canvas.style.width = `${entry.frameWidth}px`;
    canvas.style.height = `${entry.frameHeight}px`;
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.pointerEvents = "none";
    return canvas;
  });

  canvases.forEach((canvas) => wrapper.appendChild(canvas));

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => {
    const columns = Math.max(1, Math.floor(image.naturalWidth / entry.frameWidth));
    const rows = Math.max(1, Math.floor(image.naturalHeight / entry.frameHeight));
    const totalCells = columns * rows;
    if (!totalCells) {
      return;
    }

    canvases.forEach((canvas, index) => {
      const frameIndex = framesToDraw[index];
      if (frameIndex == null) {
        return;
      }

      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      const clampedIndex = clamp(Math.floor(frameIndex), 0, totalCells - 1);
      const column = clampedIndex % columns;
      const row = Math.floor(clampedIndex / columns);
      const sourceX = column * entry.frameWidth;
      const sourceY = row * entry.frameHeight;

      context.save();
      try {
        context.scale(ratio, ratio);
        context.clearRect(0, 0, entry.frameWidth, entry.frameHeight);
        context.imageSmoothingEnabled = false;
        context.drawImage(
          image,
          sourceX,
          sourceY,
          entry.frameWidth,
          entry.frameHeight,
          0,
          0,
          entry.frameWidth,
          entry.frameHeight,
        );
      } finally {
        context.restore();
      }
    });

    if (state.selectedLayer?.key === entry.key) {
      updatePivotHandle();
    }
  };
  image.onerror = (error) => {
    console.warn(`Unable to load board spritesheet asset: ${assetUrl}`, error);
  };
  image.src = assetUrl;

  return wrapper;
}

function resolveAssetPath(relativePath, pathSegments = []) {
  if (!relativePath) return "";
  if (/^(?:https?:)?\/\//.test(relativePath)) {
    return relativePath;
  }
  if (relativePath.startsWith("/")) {
    return relativePath;
  }

  const normalized = normalizeMetadataPath(relativePath, pathSegments);
  const baseUrl = new URL(ASSET_BASE_PATH, window.location.href);
  return new URL(normalized, baseUrl).toString();
}

async function loadBoardMetadata() {
  const response = await fetch(BOARD_METADATA_PATH);
  if (!response.ok) {
    throw new Error("Unable to load boards metadata");
  }
  const data = await response.json();
  return data;
}

function collectShopItems(node, accumulator = new Map()) {
  if (!node || typeof node !== "object") {
    return accumulator;
  }

  Object.entries(node).forEach(([key, value]) => {
    if (!value || typeof value !== "object") {
      return;
    }

    const hasItemMetadata = Object.prototype.hasOwnProperty.call(value, "cost") ||
      Object.prototype.hasOwnProperty.call(value, "name");

    if (hasItemMetadata) {
      const entry = {};
      if (Object.prototype.hasOwnProperty.call(value, "name") && typeof value.name === "string") {
        entry.name = value.name;
      }
      if (Object.prototype.hasOwnProperty.call(value, "cost")) {
        const rawCost = value.cost;
        if (typeof rawCost === "number") {
          entry.cost = rawCost;
        } else if (typeof rawCost === "string") {
          const parsed = Number(rawCost);
          if (Number.isFinite(parsed)) {
            entry.cost = parsed;
          }
        }
      }
      accumulator.set(key, entry);
    }

    collectShopItems(value, accumulator);
  });

  return accumulator;
}

function normalizeShopDetail(detail) {
  const normalized = { name: null, cost: null };
  if (!detail || typeof detail !== "object") {
    return normalized;
  }

  const rawName = typeof detail.name === "string" ? detail.name.trim() : "";
  if (rawName) {
    normalized.name = rawName;
  }

  const rawCost = detail.cost;
  if (typeof rawCost === "number") {
    if (Number.isFinite(rawCost)) {
      normalized.cost = rawCost;
    }
  } else if (typeof rawCost === "string") {
    const parsed = Number(rawCost);
    if (Number.isFinite(parsed)) {
      normalized.cost = parsed;
    }
  }

  return normalized;
}

function cloneShopCatalogs(catalogs = {}) {
  const clones = {};
  Object.entries(catalogs).forEach(([shopId, catalog]) => {
    const items = Array.isArray(catalog?.items) ? [...catalog.items] : [];
    const details = {};
    if (catalog?.itemDetails && typeof catalog.itemDetails === "object") {
      Object.entries(catalog.itemDetails).forEach(([itemId, detail]) => {
        const normalized = normalizeShopDetail(detail);
        const entry = {};
        if (normalized.name !== null) {
          entry.name = normalized.name;
        }
        if (normalized.cost !== null) {
          entry.cost = normalized.cost;
        }
        if (Object.keys(entry).length) {
          details[itemId] = entry;
        }
      });
    }

    clones[shopId] = {
      label: catalog?.label ?? shopId,
      items,
      itemDetails: details,
    };
  });

  return clones;
}

async function loadShopCatalogs() {
  const entries = await Promise.all(
    Object.entries(SHOP_DATA_SOURCES).map(async ([shopId, descriptor]) => {
      try {
        const response = await fetch(descriptor.path);
        if (!response.ok) {
          throw new Error(`Failed to load catalog: ${descriptor.path}`);
        }
        const data = await response.json();
        const itemMap = collectShopItems(data);
        const items = Array.from(itemMap.keys()).sort((a, b) => a.localeCompare(b));
        const itemDetails = Object.fromEntries(itemMap.entries());
        return [shopId, { ...descriptor, items, itemDetails }];
      } catch (error) {
        console.warn(`Unable to load shop catalog "${shopId}":`, error);
        return [shopId, { ...descriptor, items: [], itemDetails: {} }];
      }
    }),
  );

  return Object.fromEntries(entries);
}

const CLOSET_COLLECTIONS = {
  assets: closetAssets,
  tops: topsMetadata,
  bottoms: bottomsMetadata,
  shoes: shoesMetadata,
  face_acc: faceAccessoriesMetadata,
  body_acc: bodyAccessoriesMetadata,
  outfits: outfitsMetadata,
  costumes: costumesMetadata,
};

const AVATAR_COLLECTIONS = {
  body: bodyMetadata,
  heads: headsMetadata,
  avatar_parts: avatarPartsMetadata,
};

const BASE_FEATURE_MAPPING = new Map([
  ["eyes", "eyes"],
  ["brows", "brows"],
  ["mbrows", "brows"],
  ["lips", "lips"],
  ["mlips", "lips"],
  ["mouth", "mouth"],
  ["mmouth", "mouth"],
]);

function getBaseSlot(entry) {
  if (!entry?.pathSegments?.length) {
    return null;
  }

  const [root, ...rest] = entry.pathSegments;
  if (root === "body") {
    return "body";
  }
  if (root === "heads") {
    return "head";
  }

  if (root === "avatar_parts") {
    const feature = rest[1] ?? rest[0];
    if (feature && BASE_FEATURE_MAPPING.has(feature)) {
      return BASE_FEATURE_MAPPING.get(feature) ?? null;
    }
  }

  return null;
}

function updateBaseCoordinateDisplay() {
  if (!dom.bodyCoords || !dom.headCoords) {
    return;
  }

  const body = state.baseLayers.get("body");
  const head = state.baseLayers.get("head");

  const format = (layer) => {
    if (!layer) {
      return "–";
    }
    const x = Math.round(coerceNumber(layer.position?.x));
    const y = Math.round(coerceNumber(layer.position?.y));
    return `${x}, ${y}`;
  };

  dom.bodyCoords.textContent = format(body);
  dom.headCoords.textContent = format(head);
}

function buildAssetIndex(boardsMetadata) {
  const index = [];

  const traverse = (node, pathSegments = []) => {
    if (node && typeof node === "object" && "path" in node && ("fitX" in node || "fitY" in node || "offsetX" in node || "offsetY" in node)) {
      const key = pathSegments.join("|");
      const id = pathSegments[pathSegments.length - 1];
      const filename = node.path.split("/").pop();
      const resolvedPath = resolveAssetPath(node.path, pathSegments);
      const { width: frameWidth, height: frameHeight } = extractFrameDimensions(node);
      const isSpritesheet = Boolean((node.type === "sprite" || frameWidth || frameHeight) && frameWidth && frameHeight);
      const hasFit = Object.prototype.hasOwnProperty.call(node, "fitX") || Object.prototype.hasOwnProperty.call(node, "fitY");
      const hasOffset = Object.prototype.hasOwnProperty.call(node, "offsetX") || Object.prototype.hasOwnProperty.call(node, "offsetY");
      const type = hasFit ? "fit" : hasOffset ? "offset" : "unknown";
      const initialX = hasFit
        ? coerceNumber(node.fitX)
        : hasOffset
          ? coerceNumber(node.offsetX)
          : 0;
      const initialY = hasFit
        ? coerceNumber(node.fitY)
        : hasOffset
          ? coerceNumber(node.offsetY)
          : 0;

      index.push({
        key,
        id,
        filename,
        path: node.path,
        pathSegments: [...pathSegments],
        resolvedPath,
        metadata: node,
        type,
        initialX,
        initialY,
        category: pathSegments[0] ?? "uncategorized",
        isSpritesheet,
        frameWidth,
        frameHeight,
      });
      return;
    }

    if (node && typeof node === "object") {
      Object.entries(node).forEach(([segment, value]) => {
        traverse(value, [...pathSegments, segment]);
      });
    }
  };

  const catalogSources = [CLOSET_COLLECTIONS, AVATAR_COLLECTIONS];

  catalogSources.forEach((collections) => {
    Object.entries(collections).forEach(([category, payload]) => {
      if (payload) {
        traverse(payload, [category]);
      }
    });
  });

  Object.entries(boardsMetadata).forEach(([id, metadata]) => {
    const pathSegments = ["boards", id];
    const resolvedPath = resolveAssetPath(metadata.path, pathSegments);
    const { width: frameWidth, height: frameHeight } = extractFrameDimensions(metadata);
    index.push({
      key: pathSegments.join("|"),
      id,
      filename: metadata.path.split("/").pop(),
      path: metadata.path,
      pathSegments,
      resolvedPath,
      metadata,
      type: "offset",
      initialX: coerceNumber(metadata.offsetX),
      initialY: coerceNumber(metadata.offsetY),
      category: "boards",
      isSpritesheet: Boolean(frameWidth && frameHeight),
      frameWidth,
      frameHeight,
    });
  });

  return index;
}

function annotateAssetIndexWithShops(assetIndex, shopCatalogs) {
  if (!Array.isArray(assetIndex) || !shopCatalogs) {
    return;
  }

  assetIndex.forEach((entry) => {
    entry.shopIds = [];
    entry.shopDetails = {};
  });

  const entryById = new Map(assetIndex.map((entry) => [entry.id, entry]));

  Object.entries(shopCatalogs).forEach(([shopId, catalog]) => {
    const items = Array.isArray(catalog?.items) ? catalog.items : [];
    items.forEach((itemId) => {
      const entry = entryById.get(itemId);
      if (!entry) {
        return;
      }

      if (!entry.shopIds.includes(shopId)) {
        entry.shopIds.push(shopId);
      }

      const detail = catalog?.itemDetails?.[itemId];
      if (detail && typeof detail === "object") {
        entry.shopDetails[shopId] = { ...detail };
      }
    });
  });

  assetIndex.forEach((entry) => {
    entry.shopIds.sort((a, b) => a.localeCompare(b));
  });
}

function ensureShopAssignment(assetId, shopId) {
  if (!assetId || !shopId) {
    return null;
  }

  if (!state.shopAssignments.has(assetId)) {
    state.shopAssignments.set(assetId, {});
  }

  const record = state.shopAssignments.get(assetId);
  if (!record[shopId]) {
    const catalog = state.shopCatalogs?.[shopId];
    const items = Array.isArray(catalog?.items) ? catalog.items : [];
    const detail = catalog?.itemDetails?.[assetId];
    record[shopId] = {
      enabled: items.includes(assetId),
      name: typeof detail?.name === "string" ? detail.name : "",
      cost: detail?.cost != null ? String(detail.cost) : "",
    };
  }

  return record[shopId];
}

function applyAssignmentToCatalog(assetId, shopId) {
  const catalog = state.shopCatalogs?.[shopId];
  if (!catalog) {
    return;
  }

  if (!catalog.itemDetails) {
    catalog.itemDetails = {};
  }

  const assignment = ensureShopAssignment(assetId, shopId);
  if (!assignment) {
    return;
  }

  const detail = {};
  const name = typeof assignment.name === "string" ? assignment.name.trim() : "";
  if (name) {
    detail.name = name;
  }

  if (assignment.cost !== "" && assignment.cost !== null && assignment.cost !== undefined) {
    const parsed = Number(assignment.cost);
    if (Number.isFinite(parsed)) {
      detail.cost = parsed;
    }
  }

  if (Object.keys(detail).length) {
    catalog.itemDetails[assetId] = detail;
  } else {
    delete catalog.itemDetails[assetId];
  }
}

function getShopDisplayStrings(entry) {
  if (!entry || !Array.isArray(entry.shopIds) || !entry.shopIds.length) {
    return [];
  }

  return entry.shopIds
    .map((shopId) => {
      const catalog = state.shopCatalogs?.[shopId];
      const label = catalog?.label ?? shopId;
      const detail = entry.shopDetails?.[shopId];
      const segments = [];
      if (detail?.name) {
        segments.push(detail.name);
      }
      if (typeof detail?.cost === "number") {
        segments.push(`$${detail.cost}`);
      }
      if (!label) {
        return segments.length ? segments.join(" – ") : null;
      }
      return segments.length ? `${label} – ${segments.join(" · ")}` : label;
    })
    .filter(Boolean);
}

function updateAssetButtonShopMetadata(assetId) {
  if (!dom.assetList) {
    return;
  }

  const entry = state.assetIndexById?.get(assetId);
  if (!entry) {
    return;
  }

  const shopStrings = getShopDisplayStrings(entry);
  const title = shopStrings.length ? `${entry.id} – ${shopStrings.join(", ")}` : entry.id;
  const value = shopStrings.join(", ");

  const buttons = dom.assetList.querySelectorAll(".asset-button");
  buttons.forEach((button) => {
    if (button.dataset.key === entry.key) {
      button.dataset.shops = value;
      button.title = title;
    }
  });
}

function refreshAssetShopMetadata(assetId) {
  if (!assetId) {
    return;
  }

  const entry = state.assetIndexById?.get(assetId);
  if (!entry) {
    return;
  }

  const shopIds = Object.entries(state.shopCatalogs ?? {})
    .filter(([, catalog]) => Array.isArray(catalog?.items) && catalog.items.includes(assetId))
    .map(([shopId]) => shopId)
    .sort((a, b) => a.localeCompare(b));

  entry.shopIds = shopIds;
  entry.shopDetails = {};

  shopIds.forEach((shopId) => {
    const detail = state.shopCatalogs?.[shopId]?.itemDetails?.[assetId];
    if (detail && typeof detail === "object") {
      entry.shopDetails[shopId] = { ...detail };
    }
  });

  updateAssetButtonShopMetadata(assetId);
}

function refreshShopFilterOptions() {
  const filter = dom.shopFilter;
  if (!filter) {
    return;
  }

  const previousValue = filter.value;
  populateShopFilter(state.shopCatalogs);

  if (previousValue && Array.from(filter.options).some((option) => option.value === previousValue)) {
    filter.value = previousValue;
  } else {
    filter.value = "";
  }
}

function setShopMembership(assetId, shopId, enabled) {
  const catalog = state.shopCatalogs?.[shopId];
  if (!catalog) {
    return;
  }

  const assignment = ensureShopAssignment(assetId, shopId);
  if (!assignment) {
    return;
  }

  assignment.enabled = enabled;

  if (!Array.isArray(catalog.items)) {
    catalog.items = [];
  }
  if (!catalog.itemDetails) {
    catalog.itemDetails = {};
  }

  const alreadyListed = catalog.items.includes(assetId);

  if (enabled) {
    if (!alreadyListed) {
      catalog.items.push(assetId);
      catalog.items.sort((a, b) => a.localeCompare(b));
    }
    applyAssignmentToCatalog(assetId, shopId);
  } else {
    if (alreadyListed) {
      catalog.items = catalog.items.filter((item) => item !== assetId);
    }
    delete catalog.itemDetails[assetId];
  }

  refreshAssetShopMetadata(assetId);
  refreshShopFilterOptions();
  renderAssetList();
}

function updateShopDetail(assetId, shopId, field, value) {
  const assignment = ensureShopAssignment(assetId, shopId);
  if (!assignment) {
    return;
  }

  if (field === "name") {
    assignment.name = value;
  } else if (field === "cost") {
    assignment.cost = value;
  }

  if (assignment.enabled) {
    applyAssignmentToCatalog(assetId, shopId);
    refreshAssetShopMetadata(assetId);
  }
}

function renderShopEditor(layer) {
  const editor = dom.shopEditor;
  const rowsContainer = dom.shopEditorRows;
  if (!editor || !rowsContainer) {
    return;
  }

  rowsContainer.innerHTML = "";

  const shops = Object.entries(state.shopCatalogs ?? {});
  if (!layer || !shops.length) {
    editor.hidden = true;
    return;
  }

  editor.hidden = false;

  const assetId = layer.id;
  shops
    .slice()
    .sort(([, a], [, b]) => {
      const labelA = a?.label ?? "";
      const labelB = b?.label ?? "";
      return labelA.localeCompare(labelB);
    })
    .forEach(([shopId, catalog]) => {
      const assignment = ensureShopAssignment(assetId, shopId);
      const row = document.createElement("div");
      row.className = "shop-editor-row";

      const toggle = document.createElement("label");
      toggle.className = "shop-editor-toggle";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(assignment?.enabled);
      checkbox.addEventListener("change", (event) => {
        const isChecked = event.currentTarget.checked;
        setShopMembership(assetId, shopId, isChecked);
        renderShopEditor(layer);
      });

      const label = document.createElement("span");
      label.textContent = catalog?.label ?? shopId;

      toggle.appendChild(checkbox);
      toggle.appendChild(label);
      row.appendChild(toggle);

      const inputs = document.createElement("div");
      inputs.className = "shop-editor-inputs";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "Item name";
      nameInput.value = assignment?.name ?? "";
      nameInput.disabled = !assignment?.enabled;
      nameInput.addEventListener("input", (event) => {
        updateShopDetail(assetId, shopId, "name", event.currentTarget.value);
      });

      const priceInput = document.createElement("input");
      priceInput.type = "number";
      priceInput.min = "0";
      priceInput.step = "1";
      priceInput.inputMode = "decimal";
      priceInput.placeholder = "Price";
      priceInput.value = assignment?.cost ?? "";
      priceInput.disabled = !assignment?.enabled;
      priceInput.addEventListener("input", (event) => {
        updateShopDetail(assetId, shopId, "cost", event.currentTarget.value);
      });

      inputs.appendChild(nameInput);
      inputs.appendChild(priceInput);
      row.appendChild(inputs);

      rowsContainer.appendChild(row);
    });
}

function populateCategoryFilter(categories) {
  const filter = dom.categoryFilter;
  filter.innerHTML = "";
  const optionAll = document.createElement("option");
  optionAll.value = "";
  optionAll.textContent = "All categories";
  filter.appendChild(optionAll);

  categories.sort().forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    filter.appendChild(option);
  });
}

function populateShopFilter(shopCatalogs) {
  const filter = dom.shopFilter;
  if (!filter) {
    return;
  }

  filter.innerHTML = "";

  const optionAll = document.createElement("option");
  optionAll.value = "";
  optionAll.textContent = "All shops";
  filter.appendChild(optionAll);

  const entries = Object.entries(shopCatalogs)
    .filter(([, catalog]) => Array.isArray(catalog?.items) && catalog.items.length > 0)
    .sort(([, a], [, b]) => {
      const labelA = a?.label ?? "";
      const labelB = b?.label ?? "";
      return labelA.localeCompare(labelB);
    });

  entries.forEach(([shopId, catalog]) => {
    const option = document.createElement("option");
    option.value = shopId;
    const label = catalog?.label ?? shopId;
    const count = catalog?.items?.length ?? 0;
    option.textContent = count ? `${label} (${count})` : label;
    filter.appendChild(option);
  });
}

function filterAssets() {
  const query = dom.search.value.trim().toLowerCase();
  const categoryFilter = dom.categoryFilter.value;
  const shopFilter = dom.shopFilter?.value ?? "";

  return state.assetIndex.filter((entry) => {
    const matchesQuery = !query ||
      entry.id.toLowerCase().includes(query) ||
      entry.filename.toLowerCase().includes(query);
    const matchesCategory = !categoryFilter || entry.category === categoryFilter;
    const matchesShop = !shopFilter || (Array.isArray(entry.shopIds) && entry.shopIds.includes(shopFilter));
    return matchesQuery && matchesCategory && matchesShop;
  });
}

function renderAssetList() {
  const list = dom.assetList;
  list.innerHTML = "";

  const filtered = filterAssets();
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No assets match the current filters.";
    list.appendChild(empty);
    return;
  }

  const grouped = new Map();
  filtered.forEach((entry) => {
    if (!grouped.has(entry.category)) {
      grouped.set(entry.category, []);
    }
    grouped.get(entry.category).push(entry);
  });

  grouped.forEach((entries, category) => {
    entries.sort((a, b) => a.id.localeCompare(b.id));
    const wrapper = document.createElement("details");
    wrapper.className = "asset-category";
    wrapper.open = true;

    const summary = document.createElement("summary");
    summary.textContent = `${category} (${entries.length})`;
    wrapper.appendChild(summary);

    const container = document.createElement("div");
    entries.forEach((entry) => {
      const button = document.createElement("button");
      button.className = "asset-button";
      button.type = "button";
      button.dataset.key = entry.key;
      button.innerHTML = `<span>${entry.id}</span><small>${entry.filename}</small>`;
      const shopLabels = getShopDisplayStrings(entry);
      if (shopLabels.length) {
        button.dataset.shops = shopLabels.join(", ");
        button.title = `${entry.id} – ${shopLabels.join(", ")}`;
      } else {
        button.dataset.shops = "";
        button.title = entry.id;
      }
      button.addEventListener("click", () => handleAssetSelection(entry));
      container.appendChild(button);
    });

    wrapper.appendChild(container);
    list.appendChild(wrapper);
  });
}

function setAvatarGender(gender) {
  state.gender = gender;
  clearLayers();

  if (!state.assetIndex.length) {
    console.warn("Asset index has not been built yet.");
    return;
  }

  const bodyEntry = findFirstEntryWithPrefix(["body", "body", gender]);
  if (!bodyEntry) {
    console.warn(`No body metadata found for gender: ${gender}`);
    return;
  }

  applyBaseEntry(bodyEntry);
  loadDefaultAvatarParts(gender);
}

function resolvePlacement(entry) {
  const saved = state.savedPlacements[entry.key];
  const x = coerceNumber(saved?.x, entry.initialX);
  const y = coerceNumber(saved?.y, entry.initialY);
  return { x, y };
}

function resolvePivot(entry) {
  const saved = state.savedPlacements[entry.key];
  const pivotX = typeof saved?.pivotX === "number" ? saved.pivotX : 0.5;
  const pivotY = typeof saved?.pivotY === "number" ? saved.pivotY : 0.5;
  return {
    x: clamp(pivotX, 0, 1),
    y: clamp(pivotY, 0, 1),
  };
}

function renderBaseBody(entry, x, y) {
  const basePath = entry.resolvedPath ?? resolveAssetPath(entry.path, entry.pathSegments);
  applyAssetTransformOrigin(dom.baseAvatar);
  const applyPosition = () => {
    dom.baseAvatar.style.left = `${x}px`;
    dom.baseAvatar.style.top = `${y}px`;
  };

  state.bodyKey = entry.id;
  dom.baseAvatar.dataset.key = entry.key;

  dom.baseAvatar.width = 0;
  dom.baseAvatar.height = 0;
  dom.baseAvatar.style.removeProperty("width");
  dom.baseAvatar.style.removeProperty("height");
  applyPosition();

  const context = dom.baseAvatar.getContext?.("2d");
  if (!context) {
    console.warn("Unable to obtain a 2D context for the base avatar canvas");
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  const frameWidth = entry.frameWidth;
  const frameHeight = entry.frameHeight;
  const isSpritesheet = Boolean(frameWidth && frameHeight);

  const renderImage = (image) => {
    const renderWidth = isSpritesheet ? frameWidth || image.naturalWidth : image.naturalWidth;
    const renderHeight = isSpritesheet ? frameHeight || image.naturalHeight : image.naturalHeight;
    const sourceWidth = isSpritesheet ? frameWidth || renderWidth : renderWidth;
    const sourceHeight = isSpritesheet ? frameHeight || renderHeight : renderHeight;

    if (!renderWidth || !renderHeight) {
      applyPosition();
      return;
    }

    dom.baseAvatar.width = renderWidth * ratio;
    dom.baseAvatar.height = renderHeight * ratio;
    dom.baseAvatar.style.width = `${renderWidth}px`;
    dom.baseAvatar.style.height = `${renderHeight}px`;
    if (dom.stageContent) {
      dom.stageContent.style.width = `${renderWidth}px`;
      dom.stageContent.style.height = `${renderHeight}px`;
    }

    context.save();
    try {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, renderWidth, renderHeight);
      context.imageSmoothingEnabled = false;
      context.drawImage(
        image,
        0,
        0,
        sourceWidth,
        sourceHeight,
        0,
        0,
        renderWidth,
        renderHeight,
      );
    } catch (error) {
      console.warn("Failed to render base avatar", error);
    } finally {
      context.restore();
      applyPosition();
    }
  };

  if (!basePath) {
    applyPosition();
    if (dom.stageContent) {
      dom.stageContent.style.removeProperty("width");
      dom.stageContent.style.removeProperty("height");
    }
    return;
  }

  const loader = new Image();
  loader.crossOrigin = "anonymous";
  loader.onload = () => renderImage(loader);
  loader.onerror = (error) => {
    console.warn(`Unable to load base avatar asset: ${basePath}`, error);
    applyPosition();
  };
  loader.src = basePath;
}

function applyBaseEntry(entry) {
  const slot = getBaseSlot(entry);
  if (!slot) {
    return false;
  }

  const resolvedPosition = resolvePlacement(entry);
  const placement = { x: resolvedPosition.x, y: resolvedPosition.y };

  if (slot === "body") {
    renderBaseBody(entry, placement.x, placement.y);
    state.baseLayers.set(slot, {
      key: entry.key,
      id: entry.id,
      category: entry.category,
      filename: entry.filename,
      pathSegments: entry.pathSegments,
      node: dom.baseAvatar,
      metadata: entry.metadata,
      type: entry.type,
      original: { x: entry.initialX, y: entry.initialY },
      position: placement,
    });
    updateBaseCoordinateDisplay();
    return true;
  }

  const element = createLayerElement(entry, { className: "base-layer-item" });
  if (!element) {
    console.warn(`Unable to create base layer element for ${entry.id}`);
    return true;
  }

  element.dataset.key = entry.key;
  element.style.left = `${placement.x}px`;
  element.style.top = `${placement.y}px`;

  const previous = state.baseLayers.get(slot);
  if (previous?.node && previous.node !== dom.baseAvatar) {
    previous.node.remove();
  }

  dom.basePartsContainer?.appendChild(element);

  state.baseLayers.set(slot, {
    key: entry.key,
    id: entry.id,
    category: entry.category,
    filename: entry.filename,
    pathSegments: entry.pathSegments,
    node: element,
    metadata: entry.metadata,
    type: entry.type,
    original: { x: entry.initialX, y: entry.initialY },
    position: placement,
  });

  updateBaseCoordinateDisplay();
  return true;
}

function findFirstEntryWithPrefix(prefix) {
  const matches = state.assetIndex
    .filter((entry) => prefix.every((segment, index) => entry.pathSegments[index] === segment));
  if (!matches.length) {
    return null;
  }
  return matches.slice().sort((a, b) => a.id.localeCompare(b.id))[0];
}

function clearBaseLayers() {
  state.baseLayers.forEach((layer) => {
    if (layer.node && layer.node !== dom.baseAvatar) {
      layer.node.remove();
    }
  });
  state.baseLayers.clear();
  state.bodyKey = null;

  if (dom.basePartsContainer) {
    dom.basePartsContainer.innerHTML = "";
  }

  const context = dom.baseAvatar.getContext?.("2d");
  if (context) {
    context.clearRect(0, 0, dom.baseAvatar.width || 0, dom.baseAvatar.height || 0);
  }

  dom.baseAvatar.width = 0;
  dom.baseAvatar.height = 0;
  dom.baseAvatar.style.removeProperty("width");
  dom.baseAvatar.style.removeProperty("height");
  dom.baseAvatar.style.left = "0px";
  dom.baseAvatar.style.top = "0px";
  delete dom.baseAvatar.dataset.key;
  if (dom.stageContent) {
    dom.stageContent.style.removeProperty("width");
    dom.stageContent.style.removeProperty("height");
  }

  updateBaseCoordinateDisplay();
}

function loadDefaultAvatarParts(gender) {
  if (!state.assetIndex.length) {
    return;
  }

  const defaults = [];
  const headEntry = findFirstEntryWithPrefix(["heads", "head", gender]);
  if (headEntry) {
    defaults.push(headEntry);
  }

  const featureGroups = new Map();
  state.assetIndex.forEach((entry) => {
    const [root, entryGender, feature] = entry.pathSegments;
    if (root !== "avatar_parts" || entryGender !== gender || !feature) {
      return;
    }
    if (!featureGroups.has(feature)) {
      featureGroups.set(feature, []);
    }
    featureGroups.get(feature).push(entry);
  });

  const featureOrder = gender === "male"
    ? ["eyes", "mbrows", "mlips"]
    : ["eyes", "brows", "lips"];

  featureOrder.forEach((feature) => {
    const entries = featureGroups.get(feature);
    if (!entries?.length) {
      return;
    }
    defaults.push(entries.slice().sort((a, b) => a.id.localeCompare(b.id))[0]);
    featureGroups.delete(feature);
  });

  Array.from(featureGroups.values()).forEach((entries) => {
    if (!entries.length) {
      return;
    }
    defaults.push(entries.slice().sort((a, b) => a.id.localeCompare(b.id))[0]);
  });

  defaults.forEach((entry) => {
    if (entry) {
      handleAssetSelection(entry);
    }
  });
}

function clearLayers() {
  state.layers = [];
  state.selectedLayer = null;
  dom.layerContainer.innerHTML = "";
  clearBaseLayers();
  renderLayerPanel();
  updateSelectionPanel();
  updatePivotHandle();
}

function createLayerElement(entry, { className = "layer-item" } = {}) {
  const assetUrl = entry.resolvedPath ?? resolveAssetPath(entry.path, entry.pathSegments);

  if (entry.category === "boards" && entry.metadata?.middleEffect && entry.isSpritesheet) {
    const composite = createBoardLayerElement(entry, assetUrl, className);
    if (composite) {
      return composite;
    }
  }

  if (entry.isSpritesheet && entry.frameWidth && entry.frameHeight) {
    const canvas = document.createElement("canvas");
    const ratio = window.devicePixelRatio || 1;
    canvas.width = entry.frameWidth * ratio;
    canvas.height = entry.frameHeight * ratio;
    canvas.style.width = `${entry.frameWidth}px`;
    canvas.style.height = `${entry.frameHeight}px`;
    canvas.className = className;
    applyAssetTransformOrigin(canvas);

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const context = canvas.getContext("2d");
      if (!context) return;

      const drawFrame = (frameIndex) => {
        if (frameIndex == null) {
          return;
        }

        const columns = Math.max(1, Math.floor(image.naturalWidth / entry.frameWidth));
        const rows = Math.max(1, Math.floor(image.naturalHeight / entry.frameHeight));
        const totalCells = columns * rows;
        if (!totalCells) {
          return;
        }

        const clampedIndex = clamp(Math.floor(frameIndex), 0, totalCells - 1);
        const column = clampedIndex % columns;
        const row = Math.floor(clampedIndex / columns);
        const sourceX = column * entry.frameWidth;
        const sourceY = row * entry.frameHeight;

        context.drawImage(
          image,
          sourceX,
          sourceY,
          entry.frameWidth,
          entry.frameHeight,
          0,
          0,
          entry.frameWidth,
          entry.frameHeight,
        );
      };

      context.save();
      try {
        context.scale(ratio, ratio);
        context.clearRect(0, 0, entry.frameWidth, entry.frameHeight);

        const framesToDraw =
          entry.category === "boards"
            ? getBoardPreviewFrames(entry.metadata)
            : [0];

        framesToDraw.forEach(drawFrame);
      } catch (error) {
        console.warn(`Failed to render spritesheet for ${entry.id}`, error);
      } finally {
        context.restore();
      }
      if (state.selectedLayer?.key === entry.key) {
        updatePivotHandle();
      }
    };
    image.onerror = (error) => {
      console.warn(`Unable to load spritesheet asset: ${assetUrl}`, error);
    };
    image.src = assetUrl;

    return canvas;
  }

  const img = document.createElement("img");
  img.src = assetUrl;
  img.alt = entry.id;
  img.className = className;
  applyAssetTransformOrigin(img);
  img.addEventListener("load", () => {
    if (state.selectedLayer?.key === entry.key) {
      updatePivotHandle();
    }
  });
  return img;
}

function handleAssetSelection(entry) {
  const baseSlot = getBaseSlot(entry);
  if (baseSlot) {
    applyBaseEntry(entry);
    return;
  }

  // avoid duplicates by selecting if already present
  const existing = state.layers.find((layer) => layer.key === entry.key);
  if (existing) {
    selectLayer(existing);
    return;
  }

  const element = createLayerElement(entry);
  if (!element) {
    console.warn(`Unable to create layer element for ${entry.id}`);
    return;
  }

  element.dataset.key = entry.key;
  const initialPosition = resolvePlacement(entry);
  const initialPivot = resolvePivot(entry);
  element.style.left = `${initialPosition.x}px`;
  element.style.top = `${initialPosition.y}px`;

  dom.layerContainer.appendChild(element);

  const layer = {
    key: entry.key,
    id: entry.id,
    category: entry.category,
    filename: entry.filename,
    pathSegments: entry.pathSegments,
    node: element,
    metadata: entry.metadata,
    type: entry.type,
    original: { x: entry.initialX, y: entry.initialY },
    position: { x: initialPosition.x, y: initialPosition.y },
    pivot: { x: initialPivot.x, y: initialPivot.y },
    visible: true,
  };

  applyLayerPivot(layer);
  setLayerVisibility(layer, true);
  attachDragHandlers(layer);
  state.layers.push(layer);
  updateLayerOrder();
  selectLayer(layer);
}

function attachDragHandlers(layer) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  const onPointerDown = (event) => {
    if (state.selectedLayer?.key !== layer.key) {
      selectLayer(layer);
    }
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    originLeft = layer.position.x;
    originTop = layer.position.y;
    layer.node.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!isDragging) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const scale = state.stageTransform.scale || 1;
    const newX = originLeft + deltaX / scale;
    const newY = originTop + deltaY / scale;
    updateLayerPosition(layer, newX, newY);
  };

  const onPointerUp = (event) => {
    if (!isDragging) return;
    isDragging = false;
    layer.node.releasePointerCapture(event.pointerId);
  };

  layer.node.addEventListener("pointerdown", onPointerDown);
  layer.node.addEventListener("pointermove", onPointerMove);
  layer.node.addEventListener("pointerup", onPointerUp);
  layer.node.addEventListener("pointerleave", onPointerUp);
}

function updateLayerOrder() {
  state.layers.forEach((layer, index) => {
    dom.layerContainer.appendChild(layer.node);
    layer.node.style.zIndex = 10 + index;
  });
  renderLayerPanel();
  updatePivotHandle();
}

function renderLayerPanel() {
  dom.layersPanel.innerHTML = "";
  if (!state.layers.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No layers on the avatar.";
    dom.layersPanel.appendChild(empty);
    return;
  }

  const displayedLayers = state.layers.slice().reverse();

  displayedLayers.forEach((layer, displayIndex) => {
    const actualIndex = state.layers.length - 1 - displayIndex;
    const entry = document.createElement("div");
    entry.className = "layer-entry";
    entry.dataset.key = layer.key;
    entry.dataset.displayIndex = String(displayIndex);
    entry.draggable = true;

    const isVisible = isLayerVisible(layer);
    if (state.selectedLayer?.key === layer.key) {
      entry.classList.add("active");
    }
    if (!isVisible) {
      entry.classList.add("is-hidden");
    }

    entry.addEventListener("dragstart", handleLayerDragStart);
    entry.addEventListener("dragend", handleLayerDragEnd);
    entry.addEventListener("dragover", handleLayerDragOver);
    entry.addEventListener("dragleave", handleLayerDragLeave);
    entry.addEventListener("drop", handleLayerDrop);

    const label = document.createElement("div");
    label.innerHTML = `<strong>${layer.id}</strong><br /><small>${layer.category}</small>`;
    entry.appendChild(label);

    const controls = document.createElement("div");
    controls.className = "layer-entry-controls";
    const visibilityButton = document.createElement("button");
    visibilityButton.type = "button";
    visibilityButton.textContent = isVisible ? "Hide" : "Show";
    visibilityButton.classList.toggle("is-off", !isVisible);
    visibilityButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleLayerVisibility(layer);
      renderLayerPanel();
    });

    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.textContent = "Up";
    upButton.disabled = actualIndex >= state.layers.length - 1;
    upButton.addEventListener("click", (event) => {
      event.stopPropagation();
      moveLayer(actualIndex, 1);
    });

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.textContent = "Down";
    downButton.disabled = actualIndex <= 0;
    downButton.addEventListener("click", (event) => {
      event.stopPropagation();
      moveLayer(actualIndex, -1);
    });

    visibilityButton.draggable = false;
    controls.appendChild(visibilityButton);

    upButton.draggable = false;
    controls.appendChild(upButton);

    downButton.draggable = false;
    controls.appendChild(downButton);
    entry.appendChild(controls);

    entry.addEventListener("click", () => selectLayer(layer));
    dom.layersPanel.appendChild(entry);
  });
}

function moveLayer(index, direction) {
  const newIndex = index + direction;
  moveLayerToActualIndex(index, newIndex);
}

function moveLayerToActualIndex(sourceIndex, targetIndex) {
  if (sourceIndex === targetIndex) return;
  if (sourceIndex < 0 || sourceIndex >= state.layers.length) return;
  if (targetIndex < 0 || targetIndex >= state.layers.length) return;
  const [layer] = state.layers.splice(sourceIndex, 1);
  state.layers.splice(targetIndex, 0, layer);
  updateLayerOrder();
}

function displayIndexToActual(displayIndex) {
  return state.layers.length - 1 - displayIndex;
}

function moveLayerByDisplayIndices(sourceDisplayIndex, targetDisplayIndex, placeBefore) {
  if (sourceDisplayIndex === null || targetDisplayIndex === null) {
    return;
  }

  const total = state.layers.length;
  if (total < 2) {
    return;
  }

  let destinationDisplayIndex = targetDisplayIndex + (placeBefore ? 0 : 1);
  if (destinationDisplayIndex > sourceDisplayIndex) {
    destinationDisplayIndex -= 1;
  }

  destinationDisplayIndex = clamp(destinationDisplayIndex, 0, total - 1);

  const sourceActualIndex = displayIndexToActual(sourceDisplayIndex);
  const destinationActualIndex = displayIndexToActual(destinationDisplayIndex);
  moveLayerToActualIndex(sourceActualIndex, destinationActualIndex);
}

function handleLayerDragStart(event) {
  const entry = event.currentTarget;
  const displayIndex = Number(entry?.dataset?.displayIndex ?? "");
  if (!Number.isFinite(displayIndex)) {
    return;
  }
  layerDragState.sourceDisplayIndex = displayIndex;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(displayIndex));
  }
  entry.classList.add("dragging");
}

function handleLayerDragEnd() {
  resetLayerDragState();
}

function handleLayerDragOver(event) {
  const entry = event.currentTarget;
  const displayIndex = Number(entry?.dataset?.displayIndex ?? "");
  if (!Number.isFinite(displayIndex)) {
    return;
  }
  if (layerDragState.sourceDisplayIndex === null) {
    return;
  }
  event.preventDefault();
  const rect = entry.getBoundingClientRect();
  const offset = event.clientY - rect.top;
  const placeBefore = offset < rect.height / 2;
  entry.classList.toggle("drop-before", placeBefore);
  entry.classList.toggle("drop-after", !placeBefore);
  layerDragState.targetDisplayIndex = displayIndex;
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
}

function handleLayerDragLeave(event) {
  const entry = event.currentTarget;
  entry.classList.remove("drop-before", "drop-after");
}

function handleLayerDrop(event) {
  event.preventDefault();
  const entry = event.currentTarget;
  const displayIndex = Number(entry?.dataset?.displayIndex ?? "");
  if (!Number.isFinite(displayIndex)) {
    resetLayerDragState();
    return;
  }
  const rect = entry.getBoundingClientRect();
  const offset = event.clientY - rect.top;
  const placeBefore = offset < rect.height / 2;
  moveLayerByDisplayIndices(
    layerDragState.sourceDisplayIndex,
    displayIndex,
    placeBefore,
  );
  resetLayerDragState();
}

function resetLayerDragState() {
  layerDragState.sourceDisplayIndex = null;
  layerDragState.targetDisplayIndex = null;
  dom.layersPanel.querySelectorAll(".layer-entry").forEach((entry) => {
    entry.classList.remove("dragging", "drop-before", "drop-after");
  });
}

function getLayerDimensions(layer) {
  if (!layer?.node) {
    return { width: 0, height: 0 };
  }
  const width = layer.node.offsetWidth
    || layer.node.naturalWidth
    || layer.metadata?.frameWidth
    || layer.metadata?.splitX
    || 0;
  const height = layer.node.offsetHeight
    || layer.node.naturalHeight
    || layer.metadata?.frameHeight
    || layer.metadata?.splitY
    || 0;
  return { width, height };
}

function getLayerPivotPosition(layer, width, height) {
  const pivotX = clamp(layer?.pivot?.x ?? 0.5, 0, 1);
  const pivotY = clamp(layer?.pivot?.y ?? 0.5, 0, 1);
  const originX = layer.position.x - width / 2;
  const originY = layer.position.y - height / 2;
  return {
    x: originX + width * pivotX,
    y: originY + height * pivotY,
  };
}

function applyLayerPivot(layer) {
  if (!layer?.node) {
    return;
  }
  const pivotX = clamp(layer?.pivot?.x ?? 0.5, 0, 1);
  const pivotY = clamp(layer?.pivot?.y ?? 0.5, 0, 1);
  layer.pivot = { x: pivotX, y: pivotY };
  layer.node.style.transformOrigin = `${pivotX * 100}% ${pivotY * 100}%`;
}

function setLayerPivot(layer, pivotX, pivotY) {
  if (!layer) {
    return;
  }
  const nextX = clamp(Number.isFinite(pivotX) ? pivotX : layer.pivot?.x ?? 0.5, 0, 1);
  const nextY = clamp(Number.isFinite(pivotY) ? pivotY : layer.pivot?.y ?? 0.5, 0, 1);
  layer.pivot = { x: nextX, y: nextY };
  applyLayerPivot(layer);
  if (state.selectedLayer?.key === layer.key) {
    updatePivotHandle();
  }
}

function isLayerVisible(layer) {
  return layer?.visible !== false;
}

function setLayerVisibility(layer, visible = true) {
  if (!layer?.node) {
    return;
  }
  const nextVisible = visible !== false;
  layer.visible = nextVisible;
  layer.node.style.display = nextVisible ? "" : "none";
  if (state.selectedLayer?.key === layer.key) {
    updatePivotHandle();
  }
}

function toggleLayerVisibility(layer) {
  if (!layer) {
    return;
  }
  setLayerVisibility(layer, !isLayerVisible(layer));
}

function updateGizmoDragToggle() {
  const handle = dom.pivotHandle;
  const button = dom.toggleGizmoDrag;
  const hasLayer = Boolean(state.selectedLayer);
  const enabled = state.isGizmoDraggingEnabled;

  if (button) {
    button.disabled = !hasLayer;
    button.classList.toggle("is-active", enabled);
    button.textContent = enabled ? "Disable Gizmo Dragging" : "Enable Gizmo Dragging";
  }

  if (handle) {
    const canShowHandle = enabled && hasLayer && isLayerVisible(state.selectedLayer);
    if (!canShowHandle) {
      handle.hidden = true;
      handle.classList.remove("dragging", "dragging-x", "dragging-y", "dragging-xy");
    }
  }
}

function updatePivotHandle() {
  const handle = dom.pivotHandle;
  if (!handle) {
    updateGizmoDragToggle();
    return;
  }
  const layer = state.selectedLayer;
  if (!layer) {
    handle.hidden = true;
    handle.classList.remove("dragging", "dragging-x", "dragging-y", "dragging-xy");
    updateGizmoDragToggle();
    return;
  }
  if (!isLayerVisible(layer)) {
    handle.hidden = true;
    handle.classList.remove("dragging", "dragging-x", "dragging-y", "dragging-xy");
    updateGizmoDragToggle();
    return;
  }
  const { width, height } = getLayerDimensions(layer);
  if (!width || !height) {
    handle.hidden = true;
    handle.classList.remove("dragging", "dragging-x", "dragging-y", "dragging-xy");
    updateGizmoDragToggle();
    return;
  }
  const pivotPosition = getLayerPivotPosition(layer, width, height);
  handle.style.left = `${pivotPosition.x}px`;
  handle.style.top = `${pivotPosition.y}px`;
  if (!state.isGizmoDraggingEnabled) {
    handle.hidden = true;
    handle.classList.remove("dragging", "dragging-x", "dragging-y", "dragging-xy");
    updateGizmoDragToggle();
    return;
  }
  handle.hidden = false;
  updateGizmoDragToggle();
}

function getStageCoordinates(event) {
  if (!dom.stageContent) {
    return null;
  }
  const rect = dom.stageContent.getBoundingClientRect();
  const scale = state.stageTransform.scale || 1;
  const x = (event.clientX - rect.left) / scale;
  const y = (event.clientY - rect.top) / scale;
  return { x, y };
}

function setupPivotHandle() {
  const handle = dom.pivotHandle;
  if (!handle) {
    return;
  }

  const originHandle = handle.querySelector('[data-axis="xy"]');
  const axisXHandle = handle.querySelector('[data-axis="x"]');
  const axisYHandle = handle.querySelector('[data-axis="y"]');

  const registerDragHandle = (element, { allowX, allowY, dragClass }) => {
    if (!element) {
      return;
    }

    let isDragging = false;
    let startPointer = null;
    let startPosition = null;

    const updatePositionFromPointer = (event) => {
      if (!isDragging || !state.isGizmoDraggingEnabled) {
        return;
      }
      const layer = state.selectedLayer;
      if (!layer) {
        return;
      }
      const coords = getStageCoordinates(event);
      if (!coords || !startPointer || !startPosition) {
        return;
      }

      let nextX = startPosition.x;
      let nextY = startPosition.y;
      if (allowX) {
        nextX = startPosition.x + (coords.x - startPointer.x);
      }
      if (allowY) {
        nextY = startPosition.y + (coords.y - startPointer.y);
      }
      updateLayerPosition(layer, nextX, nextY);
      event.preventDefault();
    };

    const endDrag = (event) => {
      if (!isDragging) {
        return;
      }
      isDragging = false;
      handle.classList.remove("dragging", "dragging-x", "dragging-y", "dragging-xy");
      startPointer = null;
      startPosition = null;
      if (event && typeof element.hasPointerCapture === "function" && element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
      event?.preventDefault?.();
    };

    element.addEventListener("pointerdown", (event) => {
      if (!state.isGizmoDraggingEnabled) {
        return;
      }
      const layer = state.selectedLayer;
      if (!layer) {
        return;
      }
      const coords = getStageCoordinates(event);
      if (!coords) {
        return;
      }
      startPointer = coords;
      startPosition = { x: layer.position.x, y: layer.position.y };
      isDragging = true;
      handle.classList.remove("dragging-x", "dragging-y", "dragging-xy");
      handle.classList.add("dragging");
      if (dragClass) {
        handle.classList.add(dragClass);
      }
      if (typeof element.setPointerCapture === "function") {
        element.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
    });

    element.addEventListener("pointermove", (event) => {
      if (!isDragging) {
        return;
      }
      if (!state.isGizmoDraggingEnabled) {
        endDrag(event);
        return;
      }
      updatePositionFromPointer(event);
    });

    element.addEventListener("pointerup", (event) => {
      updatePositionFromPointer(event);
      endDrag(event);
    });

    element.addEventListener("pointerleave", (event) => {
      if (!isDragging) {
        return;
      }
      updatePositionFromPointer(event);
      endDrag(event);
    });

    element.addEventListener("pointercancel", endDrag);
  };

  registerDragHandle(originHandle, { allowX: true, allowY: true, dragClass: "dragging-xy" });
  registerDragHandle(axisXHandle, { allowX: true, allowY: false, dragClass: "dragging-x" });
  registerDragHandle(axisYHandle, { allowX: false, allowY: true, dragClass: "dragging-y" });

  updateGizmoDragToggle();
}

function handleLayerKeyboardMovement(event) {
  if (!state.selectedLayer) {
    return;
  }

  const key = event.key;
  if (!key || !key.startsWith("Arrow")) {
    return;
  }

  const target = event.target;
  if (target) {
    const tagName = target.tagName;
    const isEditable = target.isContentEditable
      || tagName === "INPUT"
      || tagName === "TEXTAREA"
      || tagName === "SELECT";
    if (isEditable) {
      return;
    }
  }

  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  let deltaX = 0;
  let deltaY = 0;
  switch (key) {
    case "ArrowUp":
      deltaY = -1;
      break;
    case "ArrowDown":
      deltaY = 1;
      break;
    case "ArrowLeft":
      deltaX = -1;
      break;
    case "ArrowRight":
      deltaX = 1;
      break;
    default:
      return;
  }

  event.preventDefault();
  const step = event.shiftKey ? 10 : 1;
  const layer = state.selectedLayer;
  updateLayerPosition(layer, layer.position.x + deltaX * step, layer.position.y + deltaY * step);
}

function selectLayer(layer) {
  state.selectedLayer = layer;
  state.layers.forEach((entry) => {
    entry.node.classList.toggle("selected", entry.key === layer.key);
  });
  updateSelectionPanel();
  updatePivotHandle();
}

function updateSelectionPanel() {
  if (!state.selectedLayer) {
    dom.selectionPanel.hidden = true;
    renderShopEditor(null);
    updatePivotHandle();
    return;
  }

  dom.selectionPanel.hidden = false;
  dom.selectionTitle.textContent = `${state.selectedLayer.id} (${state.selectedLayer.category})`;
  dom.inputX.value = Math.round(state.selectedLayer.position.x);
  dom.inputY.value = Math.round(state.selectedLayer.position.y);
  renderShopEditor(state.selectedLayer);
}

function updateLayerPosition(layer, x, y) {
  layer.position.x = Math.round(coerceNumber(x, layer.position.x));
  layer.position.y = Math.round(coerceNumber(y, layer.position.y));
  layer.node.style.left = `${layer.position.x}px`;
  layer.node.style.top = `${layer.position.y}px`;
  if (state.selectedLayer?.key === layer.key) {
    dom.inputX.value = layer.position.x;
    dom.inputY.value = layer.position.y;
  }
  if (state.selectedLayer?.key === layer.key) {
    updatePivotHandle();
  }
}

function resetSelectedLayer() {
  if (!state.selectedLayer) return;
  updateLayerPosition(state.selectedLayer, state.selectedLayer.original.x, state.selectedLayer.original.y);
}

function removeSelectedLayer() {
  if (!state.selectedLayer) return;
  const index = state.layers.findIndex((layer) => layer.key === state.selectedLayer.key);
  if (index !== -1) {
    const [layer] = state.layers.splice(index, 1);
    layer.node.remove();
    delete state.savedPlacements[layer.key];
    persistPlacements();
  }
  state.selectedLayer = null;
  renderLayerPanel();
  updateSelectionPanel();
  updatePivotHandle();
}

function getAllLayerEntries() {
  return [
    ...Array.from(state.baseLayers.values()),
    ...state.layers,
  ];
}

function savePlacements() {
  getAllLayerEntries().forEach((layer) => {
    const entry = {
      x: layer.position.x,
      y: layer.position.y,
    };
    if (layer.pivot) {
      entry.pivotX = clamp(layer.pivot.x ?? 0.5, 0, 1);
      entry.pivotY = clamp(layer.pivot.y ?? 0.5, 0, 1);
    }
    entry.visible = isLayerVisible(layer);
    state.savedPlacements[layer.key] = entry;
  });
  persistPlacements();
  alert("Placements saved locally.");
}

function downloadMetadata() {
  const payload = {
    assets: {},
    boards: {},
  };

  getAllLayerEntries().forEach((layer) => {
    const hasChanged = layer.position.x !== layer.original.x || layer.position.y !== layer.original.y;
    if (!hasChanged) return;

    if (layer.category === "boards") {
      payload.boards[layer.pathSegments[1]] = {
        offsetX: layer.position.x,
        offsetY: layer.position.y,
      };
    } else {
      let cursor = payload.assets;
      const keyX = layer.type === "offset" ? "offsetX" : "fitX";
      const keyY = layer.type === "offset" ? "offsetY" : "fitY";
      layer.pathSegments.forEach((segment, idx) => {
        if (idx === layer.pathSegments.length - 1) {
          cursor[segment] = {
            [keyX]: layer.position.x,
            [keyY]: layer.position.y,
          };
        } else {
          cursor[segment] = cursor[segment] || {};
          cursor = cursor[segment];
        }
      });
    }
  });

  const shopChanges = {};
  Object.entries(state.shopCatalogs ?? {}).forEach(([shopId, catalog]) => {
    const baseline = state.shopCatalogBaselines?.[shopId] ?? {};
    const currentItems = Array.isArray(catalog?.items) ? [...catalog.items] : [];
    const baselineItems = Array.isArray(baseline.items) ? [...baseline.items] : [];
    const currentItemSet = new Set(currentItems);
    const baselineItemSet = new Set(baselineItems);

    const addedItems = currentItems.filter((item) => !baselineItemSet.has(item)).sort((a, b) => a.localeCompare(b));
    const removedItems = baselineItems.filter((item) => !currentItemSet.has(item)).sort((a, b) => a.localeCompare(b));

    const currentDetails = catalog?.itemDetails && typeof catalog.itemDetails === "object"
      ? catalog.itemDetails
      : {};
    const baselineDetails = baseline?.itemDetails && typeof baseline.itemDetails === "object"
      ? baseline.itemDetails
      : {};

    const detailChanges = {};
    const itemIds = new Set([
      ...Object.keys(currentDetails),
      ...Object.keys(baselineDetails),
    ]);

    itemIds.forEach((itemId) => {
      const current = normalizeShopDetail(currentDetails[itemId]);
      const original = normalizeShopDetail(baselineDetails[itemId]);
      const entry = {};

      if (current.name !== original.name) {
        entry.name = current.name;
      }
      if (current.cost !== original.cost) {
        entry.cost = current.cost;
      }

      if (Object.keys(entry).length) {
        detailChanges[itemId] = entry;
      }
    });

    const hasItemChanges = addedItems.length || removedItems.length;
    const hasDetailChanges = Object.keys(detailChanges).length;
    if (!hasItemChanges && !hasDetailChanges) {
      return;
    }

    const entry = {};
    if (hasItemChanges) {
      entry.items = {};
      if (addedItems.length) {
        entry.items.added = addedItems;
      }
      if (removedItems.length) {
        entry.items.removed = removedItems;
      }
    }
    if (hasDetailChanges) {
      entry.details = detailChanges;
    }

    shopChanges[shopId] = entry;
  });

  if (Object.keys(shopChanges).length) {
    payload.shops = shopChanges;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `metadata-${Date.now()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function setupStageDragging() {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  const stage = dom.stage;
  if (!stage) {
    return;
  }

  const beginDrag = (event) => {
    if (event.currentTarget === stage) {
      const allowedTargets = [stage, dom.stageContent];
      if (!allowedTargets.includes(event.target)) {
        return;
      }
    }
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    originX = state.stageTransform.x;
    originY = state.stageTransform.y;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event) => {
    if (!isDragging) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    state.stageTransform.x = originX + deltaX;
    state.stageTransform.y = originY + deltaY;
    applyStageTransform();
  };

  const endDrag = (event) => {
    if (!isDragging) return;
    isDragging = false;
    if (typeof event.currentTarget.hasPointerCapture === "function" && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  [stage, dom.stageHint].forEach((target) => {
    if (!target) return;
    target.addEventListener("pointerdown", beginDrag);
    target.addEventListener("pointermove", moveDrag);
    target.addEventListener("pointerup", endDrag);
    target.addEventListener("pointerleave", endDrag);
  });
}

function applySavedPlacementsOnLoad() {
  Object.entries(state.savedPlacements).forEach(([key, placement]) => {
    const entry = state.assetIndex.find((item) => item.key === key);
    if (!entry) return;
    handleAssetSelection(entry);
    const layer = state.layers.find((layer) => layer.key === key);
    if (layer) {
      updateLayerPosition(layer, placement.x, placement.y);
      if (typeof placement.pivotX === "number" || typeof placement.pivotY === "number") {
        const pivotX = typeof placement.pivotX === "number" ? placement.pivotX : layer.pivot?.x;
        const pivotY = typeof placement.pivotY === "number" ? placement.pivotY : layer.pivot?.y;
        setLayerPivot(layer, pivotX, pivotY);
      }
      setLayerVisibility(layer, placement.visible);
    }
  });
}

async function init() {
  const [boards, shopCatalogs] = await Promise.all([
    loadBoardMetadata(),
    loadShopCatalogs(),
  ]);
  state.boards = boards;
  state.shopCatalogs = shopCatalogs;
  state.shopCatalogBaselines = cloneShopCatalogs(shopCatalogs);
  state.shopAssignments = new Map();
  state.assetIndex = buildAssetIndex(state.boards);
  state.assetIndexById = new Map(state.assetIndex.map((entry) => [entry.id, entry]));
  annotateAssetIndexWithShops(state.assetIndex, state.shopCatalogs);
  const categories = Array.from(new Set(state.assetIndex.map((entry) => entry.category)));
  populateCategoryFilter(categories);
  populateShopFilter(state.shopCatalogs);
  renderAssetList();
  setupStageDragging();
  setupPivotHandle();
  applyStageTransform();
  applyStageScale();
  setAvatarGender("female");
  applySavedPlacementsOnLoad();
}

// event listeners
[
  { element: dom.search, event: "input" },
  { element: dom.categoryFilter, event: "input" },
  { element: dom.shopFilter, event: "change" },
].forEach(({ element, event }) => {
  if (!element) {
    return;
  }
  element.addEventListener(event, () => renderAssetList());
});

dom.showGirl.addEventListener("click", () => setAvatarGender("female"));
dom.showBoy.addEventListener("click", () => setAvatarGender("male"));

dom.inputX.addEventListener("change", () => {
  if (!state.selectedLayer) return;
  const value = Number(dom.inputX.value);
  updateLayerPosition(state.selectedLayer, value, state.selectedLayer.position.y);
});

dom.inputY.addEventListener("change", () => {
  if (!state.selectedLayer) return;
  const value = Number(dom.inputY.value);
  updateLayerPosition(state.selectedLayer, state.selectedLayer.position.x, value);
});

dom.resetPosition.addEventListener("click", resetSelectedLayer);
dom.toggleGizmoDrag?.addEventListener("click", () => {
  if (!state.selectedLayer) {
    return;
  }
  state.isGizmoDraggingEnabled = !state.isGizmoDraggingEnabled;
  updateGizmoDragToggle();
  updatePivotHandle();
});
dom.removeLayer.addEventListener("click", removeSelectedLayer);
dom.saveLocal.addEventListener("click", savePlacements);
dom.generateMetadata.addEventListener("click", downloadMetadata);

dom.zoomIn?.addEventListener("click", () => adjustStageScale(STAGE_SCALE_STEP));
dom.zoomOut?.addEventListener("click", () => adjustStageScale(-STAGE_SCALE_STEP));
dom.zoomReset?.addEventListener("click", () => resetStageScale());

document.addEventListener("keydown", handleLayerKeyboardMovement);

init().catch((error) => {
  console.error(error);
  dom.assetList.innerHTML = `<div class="empty-state">Failed to load metadata. ${error.message}</div>`;
});
