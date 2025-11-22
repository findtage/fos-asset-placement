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
} from "./assets/data.js";

const BOARD_METADATA_PATH = "./assets/boards_metadata.json";
const HAIR_ACC_METADATA_PATH = "./assets/hairacc_metadata.json";
const RARE_DATA_PATH = "./assets/rares.json";
const SHOP_DATA_SOURCES = {
  le_shop: { label: "Le Shop", path: "./assets/le_shop.json" },
  jesters: { label: "Jesters", path: "./assets/jesters.json" },
  stellar_salon: { label: "Stellar Salon", path: "./assets/stellar-salon.json" },
  locoboards: { label: "Loco Boardz", path: "./assets/locoboards.json" },
};
const ASSET_BASE_PATH = "";
const LOCAL_STORAGE_KEY = "fos-asset-editor-placements-v2";
const STAGE_SCALE_MIN = 0.5;
const STAGE_SCALE_MAX = 3;
const STAGE_SCALE_STEP = 0.25;
const SHOP_OPTION_RARE = "__rare__";
const LAYER_PANEL_MIN_WIDTH = 240;
const LAYER_PANEL_MAX_WIDTH = 560;
const LAYER_PANEL_DEFAULT_WIDTH = 300;

const ASSET_TRANSFORM_ORIGIN = "50% 50%";

const savedData = loadSavedData();

const state = {
  gender: "female",
  bodyKey: null,
  boards: {},
  shopCatalogs: {},
  shopCatalogBaselines: {},
  rareCatalog: {},
  rareCatalogBaseline: {},
  rareEntriesById: new Map(),
  assetIndex: [],
  assetIndexById: new Map(),
  assetIndexByKey: new Map(),
  shopAssignments: new Map(),
  baseLayers: new Map(),
  layers: [],
  selectedLayer: null,
  stageTransform: { x: 0, y: 0, scale: 1 },
  savedPlacements: savedData.placements,
  savedShopChanges: savedData.shops,
  savedRareChanges: savedData.rares,
  hairAccessories: {},
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
  sizeMetadataFilter: document.getElementById("size-metadata-filter"),
  assetList: document.getElementById("asset-list"),
  showGirl: document.getElementById("show-girl"),
  showBoy: document.getElementById("show-boy"),
  baseAvatar: document.getElementById("base-avatar"),
  stageContent: document.getElementById("stage-content"),
  basePartsContainer: document.getElementById("base-parts-container"),
  stage: document.getElementById("avatar-stage"),
  stageHint: document.getElementById("stage-hint"),
  layerContainer: document.getElementById("layer-container"),
  layerControls: document.getElementById("layer-controls"),
  layersPanel: document.getElementById("layers-panel"),
  pivotHandle: document.getElementById("pivot-handle"),
  selectionPanel: document.getElementById("selection-details"),
  selectionTitle: document.getElementById("selection-title"),
  shopEditor: document.getElementById("shop-editor"),
  shopSelect: document.getElementById("shop-select"),
  shopNameLabel: document.getElementById("shop-item-name-label"),
  shopPriceLabel: document.getElementById("shop-item-price-label"),
  shopNameInput: document.getElementById("shop-item-name"),
  shopPriceInput: document.getElementById("shop-item-price"),
  inputX: document.getElementById("input-x"),
  inputY: document.getElementById("input-y"),
  resetPosition: document.getElementById("reset-position"),
  toggleGizmoDrag: document.getElementById("toggle-gizmo-drag"),
  removeLayer: document.getElementById("remove-layer"),
  clearLayers: document.getElementById("clear-layers"),
  saveLocal: document.getElementById("save-local"),
  generateMetadata: document.getElementById("generate-metadata"),
  zoomIn: document.getElementById("zoom-in"),
  zoomOut: document.getElementById("zoom-out"),
  zoomReset: document.getElementById("zoom-reset"),
  bodyCoords: document.getElementById("body-coords"),
  headCoords: document.getElementById("head-coords"),
  layerResizer: document.getElementById("layer-resizer"),
};

dom.layerBehindContainer = document.createElement("div");
dom.layerBehindContainer.id = "layer-behind-container";
if (dom.baseAvatar?.parentNode) {
  dom.baseAvatar.parentNode.insertBefore(dom.layerBehindContainer, dom.baseAvatar);
}

[dom.stageContent, dom.layerContainer, dom.basePartsContainer, dom.layerBehindContainer, dom.baseAvatar].forEach((node) => {
  if (node?.style) {
    node.style.transformOrigin = ASSET_TRANSFORM_ORIGIN;
  }
});

function applyAssetTransformOrigin(node) {
  if (node?.style) {
    node.style.transformOrigin = ASSET_TRANSFORM_ORIGIN;
  }
}

function loadSavedData() {
  const defaults = { placements: {}, shops: {}, rares: {} };

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return defaults;
    }

    if (
      Object.prototype.hasOwnProperty.call(parsed, "placements") ||
      Object.prototype.hasOwnProperty.call(parsed, "shops") ||
      Object.prototype.hasOwnProperty.call(parsed, "rares")
    ) {
      const placements = parsed?.placements && typeof parsed.placements === "object" ? parsed.placements : {};
      const shops = parsed?.shops && typeof parsed.shops === "object" ? parsed.shops : {};
      const rares = parsed?.rares && typeof parsed.rares === "object" ? parsed.rares : {};
      return { placements, shops, rares };
    }

    return { placements: parsed, shops: {}, rares: {} };
  } catch (err) {
    console.warn("Failed to read saved data", err);
    return defaults;
  }
}

function persistSavedData() {
  const payload = {
    placements: state.savedPlacements,
    shops: state.savedShopChanges,
    rares: state.savedRareChanges,
  };
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
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

function setLayerPanelWidth(width) {
  const clamped = Math.min(LAYER_PANEL_MAX_WIDTH, Math.max(LAYER_PANEL_MIN_WIDTH, width));
  document.documentElement?.style?.setProperty("--layer-panel-width", `${clamped}px`);
}

function setupLayerResizer() {
  const resizer = dom.layerResizer;
  const panel = dom.layerControls;
  if (!resizer || !panel) {
    return;
  }

  const handleDrag = (startX, startWidth) => (event) => {
    const delta = event.clientX - startX;
    setLayerPanelWidth(startWidth - delta);
  };

  let currentMoveHandler = null;

  function stopDrag() {
    if (currentMoveHandler) {
      document.removeEventListener("mousemove", currentMoveHandler);
      currentMoveHandler = null;
    }
    document.removeEventListener("mouseup", stopWrapper);
    resizer.classList.remove("is-dragging");
  }

  function stopWrapper(event) {
    stopDrag();
    event?.preventDefault();
  }

  resizer.addEventListener("mousedown", (event) => {
    const rect = panel.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = rect.width;
    currentMoveHandler = handleDrag(startX, startWidth);
    document.addEventListener("mousemove", currentMoveHandler);
    document.addEventListener("mouseup", stopWrapper);
    resizer.classList.add("is-dragging");
    event.preventDefault();
  });

  resizer.addEventListener("dblclick", () => setLayerPanelWidth(LAYER_PANEL_DEFAULT_WIDTH));
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
    case "hair_acc":
      if (isGendered) {
        return `assets/closet/acc/${gender}/head/${path}`;
      }
      return `assets/closet/${category}/${path}`;
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

function isBoardLayerAbove(metadata = {}) {
  const rawLayerAbove = metadata.layerAbove;
  return (
    rawLayerAbove === true ||
    rawLayerAbove === 1 ||
    rawLayerAbove === "1" ||
    (typeof rawLayerAbove === "string" && rawLayerAbove.toLowerCase() === "true")
  );
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

  const isLayerAbove = isBoardLayerAbove(metadata);

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
  if (!framesToDraw.length || !entry.frameWidth || !entry.frameHeight) {
    return null;
  }

  const ratio = window.devicePixelRatio || 1;
  let frameWidth = entry.frameWidth;
  let frameHeight = entry.frameHeight;

  const frameEntries = framesToDraw.map((frameIndex) => {
    const canvas = document.createElement("canvas");
    canvas.width = frameWidth * ratio;
    canvas.height = frameHeight * ratio;
    canvas.style.width = `${frameWidth}px`;
    canvas.style.height = `${frameHeight}px`;
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.className = className;
    applyAssetTransformOrigin(canvas);
    return { node: canvas, frameIndex };
  });

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => {
    const requestedFrameCount = framesToDraw.reduce((max, index) => {
      if (!Number.isFinite(index)) {
        return max;
      }
      const next = Math.floor(index) + 1;
      return next > max ? next : max;
    }, 0);
    const metadataFrameCountRaw = Number(entry.metadata?.frames);
    const metadataFrameCount = Number.isFinite(metadataFrameCountRaw) && metadataFrameCountRaw > 0
      ? Math.floor(metadataFrameCountRaw)
      : 0;
    const desiredFrameCount = Math.max(requestedFrameCount, metadataFrameCount, 1);

    let columns = 0;
    let rows = 0;
    let totalCells = 0;

    const updateGrid = () => {
      columns = Math.max(1, Math.floor(image.naturalWidth / frameWidth));
      rows = Math.max(1, Math.floor(image.naturalHeight / frameHeight));
      totalCells = columns * rows;
    };

    const tryAdjustDimensions = (nextWidth, nextHeight) => {
      const validWidth = Number.isFinite(nextWidth) && nextWidth > 0;
      const validHeight = Number.isFinite(nextHeight) && nextHeight > 0;
      if (!validWidth && !validHeight) {
        return false;
      }
      if (validWidth) {
        frameWidth = nextWidth;
      }
      if (validHeight) {
        frameHeight = nextHeight;
      }
      updateGrid();
      return true;
    };

    updateGrid();

    if (desiredFrameCount > totalCells) {
      const totalFrames = Math.max(metadataFrameCount, desiredFrameCount);
      let adjusted = false;

      if (totalFrames > 1 && image.naturalWidth % totalFrames === 0) {
        adjusted = tryAdjustDimensions(image.naturalWidth / totalFrames, null);
      }

      if (!adjusted && totalFrames > 1 && image.naturalHeight % totalFrames === 0) {
        adjusted = tryAdjustDimensions(null, image.naturalHeight / totalFrames);
      }

      if (!adjusted && entry.metadata?.middleEffect && totalFrames === 2) {
        const splitX = Number(entry.metadata?.splitX);
        if (Number.isFinite(splitX) && splitX > 0) {
          adjusted = tryAdjustDimensions(splitX / totalFrames, null);
        }
      }

      if (adjusted && (entry.frameWidth !== frameWidth || entry.frameHeight !== frameHeight)) {
        frameEntries.forEach(({ node }) => {
          node.width = frameWidth * ratio;
          node.height = frameHeight * ratio;
          node.style.width = `${frameWidth}px`;
          node.style.height = `${frameHeight}px`;
        });
        entry.frameWidth = frameWidth;
        entry.frameHeight = frameHeight;
        if (entry.metadata) {
          entry.metadata.frameWidth = frameWidth;
          entry.metadata.frameHeight = frameHeight;
        }
      }
    }

    updateGrid();

    if (!totalCells) {
      return;
    }

    frameEntries.forEach(({ node, frameIndex }) => {
      if (frameIndex == null) {
        return;
      }

      const context = node.getContext("2d");
      if (!context) {
        return;
      }

      const clampedIndex = clamp(Math.floor(frameIndex), 0, totalCells - 1);
      const column = clampedIndex % columns;
      const row = Math.floor(clampedIndex / columns);
      const sourceX = column * frameWidth;
      const sourceY = row * frameHeight;

      context.save();
      try {
        context.scale(ratio, ratio);
        context.clearRect(0, 0, frameWidth, frameHeight);
        context.imageSmoothingEnabled = false;
        context.drawImage(
          image,
          sourceX,
          sourceY,
          frameWidth,
          frameHeight,
          0,
          0,
          frameWidth,
          frameHeight,
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

  const isLayerAbove = isBoardLayerAbove(entry.metadata);
  const hasDistinctBack = frameEntries.length > 1;
  let backNode = null;
  if (hasDistinctBack) {
    backNode = frameEntries[0].node;
    backNode.style.pointerEvents = "none";
  }

  const frontNode = frameEntries[frameEntries.length - 1]?.node ?? null;
  if (!frontNode) {
    return null;
  }

  const nodes = [frontNode];
  if (backNode && backNode !== frontNode) {
    nodes.push(backNode);
  }

  const placeFrontInForeground = entry.metadata?.middleEffect ? true : isLayerAbove;

  return {
    frontNode,
    backNode: backNode && backNode !== frontNode ? backNode : null,
    nodes,
    frontPlacement: placeFrontInForeground ? "foreground" : "background",
  };
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

async function loadHairAccessoryMetadata() {
  try {
    const response = await fetch(HAIR_ACC_METADATA_PATH);
    if (!response.ok) {
      throw new Error("Unable to load hair accessory metadata");
    }
    const data = await response.json();
    return data && typeof data === "object" ? data : {};
  } catch (error) {
    console.warn("Unable to load hair accessory metadata", error);
    return {};
  }
}

function buildHairAccessoryCollection(metadata = {}) {
  const collection = { female: {} };

  Object.entries(metadata).forEach(([id, detail]) => {
    if (!detail || typeof detail !== "object") {
      return;
    }

    const { pathname } = detail;
    if (!pathname) {
      return;
    }

    const frames = Number(detail.frames);
    const isMultiFrame = Number.isFinite(frames) && frames > 1;

    const entry = {
      path: pathname,
      type: isMultiFrame ? "sprite" : "image",
      properties: detail.properties && typeof detail.properties === "object" ? detail.properties : {},
    };

    ["fitX", "fitY", "splitX", "splitY", "frameWidth", "frameHeight", "offsetX", "offsetY"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(detail, field)) {
        entry[field] = detail[field];
      }
    });

    if (!entry.frameWidth && Object.prototype.hasOwnProperty.call(entry, "splitX")) {
      entry.frameWidth = entry.splitX;
    }
    if (!entry.frameHeight && Object.prototype.hasOwnProperty.call(entry, "splitY")) {
      entry.frameHeight = entry.splitY;
    }

    collection.female[id] = entry;
  });

  if (!Object.keys(collection.female).length) {
    return null;
  }

  return collection;
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

function computeShopChanges() {
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

  return shopChanges;
}

function applyShopChangesToCatalogs(changes, catalogs) {
  if (!changes || typeof changes !== "object" || !catalogs) {
    return;
  }

  Object.entries(changes).forEach(([shopId, change]) => {
    const catalog = catalogs?.[shopId];
    if (!catalog) {
      return;
    }

    if (!Array.isArray(catalog.items)) {
      catalog.items = [];
    }
    if (!catalog.itemDetails || typeof catalog.itemDetails !== "object") {
      catalog.itemDetails = {};
    }

    const itemsChange = change?.items;
    if (itemsChange && typeof itemsChange === "object") {
      if (Array.isArray(itemsChange.removed) && itemsChange.removed.length) {
        const removalSet = new Set(itemsChange.removed);
        catalog.items = catalog.items.filter((item) => !removalSet.has(item));
        itemsChange.removed.forEach((itemId) => {
          delete catalog.itemDetails[itemId];
        });
      }

      if (Array.isArray(itemsChange.added) && itemsChange.added.length) {
        itemsChange.added.forEach((itemId) => {
          if (!catalog.items.includes(itemId)) {
            catalog.items.push(itemId);
          }
        });
      }
    }

    const detailsChange = change?.details;
    if (detailsChange && typeof detailsChange === "object") {
      Object.entries(detailsChange).forEach(([itemId, detailChange]) => {
        const nextDetail = { ...(catalog.itemDetails?.[itemId] || {}) };
        if (detailChange && typeof detailChange === "object") {
          if (Object.prototype.hasOwnProperty.call(detailChange, "name")) {
            const rawName = typeof detailChange.name === "string" ? detailChange.name.trim() : "";
            if (rawName) {
              nextDetail.name = rawName;
            } else {
              delete nextDetail.name;
            }
          }
          if (Object.prototype.hasOwnProperty.call(detailChange, "cost")) {
            const rawCost = detailChange.cost;
            if (typeof rawCost === "number" && Number.isFinite(rawCost)) {
              nextDetail.cost = rawCost;
            } else {
              delete nextDetail.cost;
            }
          }
        }

        if (Object.keys(nextDetail).length) {
          catalog.itemDetails[itemId] = nextDetail;
        } else {
          delete catalog.itemDetails[itemId];
        }
      });
    }

    if (Array.isArray(catalog.items)) {
      catalog.items = Array.from(new Set(catalog.items)).sort((a, b) => a.localeCompare(b));
    }
  });
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

async function loadRareCatalog() {
  try {
    const response = await fetch(RARE_DATA_PATH);
    if (!response.ok) {
      throw new Error("Unable to load rare metadata");
    }
    const data = await response.json();
    return data && typeof data === "object" ? data : {};
  } catch (error) {
    console.warn("Unable to load rare metadata", error);
    return {};
  }
}

function normalizeRareDetail(detail) {
  if (!detail || typeof detail !== "object") {
    return {};
  }

  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(detail, "name") && typeof detail.name === "string") {
    const trimmed = detail.name.trim();
    if (trimmed) {
      normalized.name = trimmed;
    }
  }

  if (Object.prototype.hasOwnProperty.call(detail, "rarity")) {
    const parsed = Number(detail.rarity);
    if (Number.isFinite(parsed)) {
      normalized.rarity = parsed;
    }
  }

  return normalized;
}

function cloneRareCatalog(catalog = {}) {
  const clone = {};

  Object.entries(catalog).forEach(([group, entries]) => {
    if (!entries || typeof entries !== "object") {
      return;
    }

    const groupClone = {};
    Object.entries(entries).forEach(([assetId, detail]) => {
      groupClone[assetId] = normalizeRareDetail(detail);
    });

    clone[group] = groupClone;
  });

  return clone;
}

function applyRareChanges(changes, catalog) {
  if (!changes || typeof changes !== "object" || !catalog) {
    return;
  }

  Object.entries(changes).forEach(([group, groupChanges]) => {
    if (!groupChanges || typeof groupChanges !== "object") {
      return;
    }

    if (!catalog[group] || typeof catalog[group] !== "object") {
      catalog[group] = {};
    }

    Object.entries(groupChanges).forEach(([assetId, detail]) => {
      if (detail === null) {
        delete catalog[group][assetId];
        return;
      }

      catalog[group][assetId] = normalizeRareDetail(detail);
    });
  });
}

function buildRareIndex(catalog = {}) {
  const rareIndex = new Map();

  Object.entries(catalog).forEach(([group, entries]) => {
    if (!entries || typeof entries !== "object") {
      return;
    }

    Object.entries(entries).forEach(([assetId, detail]) => {
      rareIndex.set(assetId, { group, ...normalizeRareDetail(detail) });
    });
  });

  return rareIndex;
}

function annotateAssetIndexWithRares(assetIndex, rareIndex) {
  if (!Array.isArray(assetIndex) || !rareIndex) {
    return;
  }

  assetIndex.forEach((entry) => {
    const detail = rareIndex.get(entry.id);
    entry.isRare = Boolean(detail);
    entry.rare = detail ? { ...detail } : null;
  });
}

function getRareDisplaySegments(entry) {
  if (!entry?.isRare) {
    return [];
  }

  const segments = [];
  if (entry.rare?.name) {
    segments.push(entry.rare.name);
  }
  if (typeof entry.rare?.rarity === "number" && Number.isFinite(entry.rare.rarity)) {
    segments.push(`Rarity ${entry.rare.rarity}`);
  }
  if (!segments.length) {
    segments.push("Rare item");
  }
  return segments;
}

function buildAssetButtonTitle(entry, shopLabels, rareSegments) {
  const detailSegments = [];
  if (rareSegments.length) {
    detailSegments.push(`Rare – ${rareSegments.join(" · ")}`);
  }
  if (shopLabels.length) {
    detailSegments.push(shopLabels.join(", "));
  }
  return detailSegments.length ? `${entry.id} – ${detailSegments.join(" | ")}` : entry.id;
}

function isSameRareDetail(a, b) {
  const nameA = typeof a?.name === "string" ? a.name : "";
  const nameB = typeof b?.name === "string" ? b.name : "";
  const rarityA = typeof a?.rarity === "number" && Number.isFinite(a.rarity) ? a.rarity : null;
  const rarityB = typeof b?.rarity === "number" && Number.isFinite(b.rarity) ? b.rarity : null;
  return nameA === nameB && rarityA === rarityB;
}

function computeRareChanges() {
  const changes = {};
  const current = state.rareCatalog ?? {};
  const baseline = state.rareCatalogBaseline ?? {};

  const groups = new Set([
    ...Object.keys(current),
    ...Object.keys(baseline),
  ]);

  groups.forEach((group) => {
    const currentEntries = current[group] && typeof current[group] === "object" ? current[group] : {};
    const baselineEntries = baseline[group] && typeof baseline[group] === "object" ? baseline[group] : {};
    const assetIds = new Set([
      ...Object.keys(currentEntries),
      ...Object.keys(baselineEntries),
    ]);

    const groupChanges = {};

    assetIds.forEach((assetId) => {
      const currentHas = Object.prototype.hasOwnProperty.call(currentEntries, assetId);
      const baselineHas = Object.prototype.hasOwnProperty.call(baselineEntries, assetId);

      if (!currentHas && !baselineHas) {
        return;
      }

      if (!currentHas && baselineHas) {
        groupChanges[assetId] = null;
        return;
      }

      const currentDetail = normalizeRareDetail(currentEntries[assetId]);

      if (!baselineHas) {
        groupChanges[assetId] = currentDetail;
        return;
      }

      const baselineDetail = normalizeRareDetail(baselineEntries[assetId]);

      if (!isSameRareDetail(currentDetail, baselineDetail)) {
        groupChanges[assetId] = currentDetail;
      }
    });

    if (Object.keys(groupChanges).length) {
      changes[group] = groupChanges;
    }
  });

  return changes;
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

function buildAssetIndex(boardsMetadata, additionalClosetCollections = {}) {
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

  const catalogSources = [
    { ...CLOSET_COLLECTIONS, ...additionalClosetCollections },
    AVATAR_COLLECTIONS,
  ];

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
  const rareSegments = getRareDisplaySegments(entry);
  const title = buildAssetButtonTitle(entry, shopStrings, rareSegments);
  const value = shopStrings.join(", ");
  const rareValue = rareSegments.join(" · ");

  const buttons = dom.assetList.querySelectorAll(".asset-button");
  buttons.forEach((button) => {
    if (button.dataset.key === entry.key) {
      button.dataset.shops = value;
      button.dataset.rare = rareValue;
      button.classList.toggle("is-rare", entry.isRare);
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

function setShopMembership(assetId, shopId, enabled, options = {}) {
  const { skipRefresh } = options;
  const catalog = state.shopCatalogs?.[shopId];
  if (!catalog) {
    return false;
  }

  const assignment = ensureShopAssignment(assetId, shopId);
  if (!assignment) {
    return false;
  }

  let changed = false;
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
      changed = true;
    }
    applyAssignmentToCatalog(assetId, shopId);
  } else {
    if (alreadyListed) {
      catalog.items = catalog.items.filter((item) => item !== assetId);
      changed = true;
    }
    delete catalog.itemDetails[assetId];
  }

  if (!skipRefresh) {
    refreshAssetShopMetadata(assetId);
    refreshShopFilterOptions();
    renderAssetList();
  }

  return changed;
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

function getAssignedShopId(assetId) {
  const match = Object.entries(state.shopCatalogs ?? {})
    .find(([, catalog]) => Array.isArray(catalog?.items) && catalog.items.includes(assetId));
  return match ? match[0] : null;
}

function setExclusiveShopMembership(assetId, shopId, options = {}) {
  const { skipRareReset = false } = options;
  const targetShopId = shopId || null;

  if (targetShopId && !skipRareReset) {
    setRareStatus(assetId, false, { skipShopReset: true });
  }

  const shops = Object.keys(state.shopCatalogs ?? {});
  let hasChange = false;

  shops.forEach((currentShopId) => {
    const shouldEnable = currentShopId === targetShopId;
    const changed = setShopMembership(assetId, currentShopId, shouldEnable, { skipRefresh: true });
    hasChange = hasChange || Boolean(changed);
  });

  if (hasChange) {
    refreshAssetShopMetadata(assetId);
    refreshShopFilterOptions();
    renderAssetList();
  }
}

function renderShopEditor(layer) {
  const editor = dom.shopEditor;
  const select = dom.shopSelect;
  const nameLabel = dom.shopNameLabel;
  const priceLabel = dom.shopPriceLabel;
  const nameInput = dom.shopNameInput;
  const priceInput = dom.shopPriceInput;
  if (!editor || !select || !nameInput || !priceInput) {
    return;
  }

  const shops = Object.entries(state.shopCatalogs ?? {});
  if (!layer) {
    editor.hidden = true;
    select.innerHTML = "";
    nameInput.value = "";
    priceInput.value = "";
    nameInput.disabled = true;
    priceInput.disabled = true;
    return;
  }

  editor.hidden = false;

  const assetId = layer.id;
  const rareEntry = state.rareEntriesById?.get(assetId) ?? null;

  const options = shops
    .slice()
    .sort(([, a], [, b]) => {
      const labelA = a?.label ?? "";
      const labelB = b?.label ?? "";
      return labelA.localeCompare(labelB);
    });

  select.innerHTML = "";
  const noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "Not listed in a shop";
  select.appendChild(noneOption);

  options.forEach(([shopId, catalog]) => {
    const option = document.createElement("option");
    option.value = shopId;
    option.textContent = catalog?.label ?? shopId;
    select.appendChild(option);
  });

  const rareOption = document.createElement("option");
  rareOption.value = SHOP_OPTION_RARE;
  rareOption.textContent = "Rare";
  select.appendChild(rareOption);

  const assignedShopId = getAssignedShopId(assetId);
  const selectionValue = rareEntry ? SHOP_OPTION_RARE : (assignedShopId ?? "");
  select.value = selectionValue;

  const isRareSelection = selectionValue === SHOP_OPTION_RARE;
  const nameLabelNode = nameLabel || { textContent: null };
  const priceLabelNode = priceLabel || { textContent: null };
  nameLabelNode.textContent = isRareSelection ? "Rare name" : "Item name";
  priceLabelNode.textContent = isRareSelection ? "Rarity" : "Price";

  let nameValue = "";
  let priceValue = "";
  let inputsDisabled = false;

  if (isRareSelection) {
    nameValue = rareEntry?.name ?? "";
    priceValue = typeof rareEntry?.rarity === "number" && Number.isFinite(rareEntry.rarity)
      ? rareEntry.rarity
      : "";
  } else if (assignedShopId) {
    const assignment = ensureShopAssignment(assetId, assignedShopId);
    nameValue = assignment?.name ?? "";
    priceValue = assignment?.cost ?? "";
  } else {
    inputsDisabled = true;
  }

  nameInput.value = nameValue;
  priceInput.value = priceValue;
  nameInput.disabled = inputsDisabled;
  priceInput.disabled = inputsDisabled;
  nameInput.placeholder = isRareSelection ? "Rare item name" : "Item name";
  priceInput.placeholder = isRareSelection ? "Rarity value" : "Price";
}

function getRareGroupForAsset(assetId) {
  const entry = typeof assetId === "string" ? state.assetIndexById?.get(assetId) : assetId;
  if (!entry) {
    return null;
  }

  const genderSegment = entry.pathSegments?.find((segment) => segment === "female" || segment === "male");
  if (genderSegment) {
    return genderSegment;
  }

  if (state.gender === "female" || state.gender === "male") {
    return state.gender;
  }

  return null;
}

function setRareStatus(assetId, isRare, options = {}) {
  const { skipShopReset = false } = options;
  const existing = state.rareEntriesById?.get(assetId);
  const entry = state.assetIndexById?.get(assetId);

  if (isRare) {
    if (existing) {
      return;
    }

    const group = getRareGroupForAsset(assetId);
    if (!group) {
      console.warn(`Unable to determine rare group for asset ${assetId}`);
      return;
    }

    if (!skipShopReset) {
      setExclusiveShopMembership(assetId, null, { skipRareReset: true });
    }

    if (!state.rareCatalog[group] || typeof state.rareCatalog[group] !== "object") {
      state.rareCatalog[group] = {};
    }

    const normalized = normalizeRareDetail({});
    state.rareCatalog[group][assetId] = normalized;
    state.rareEntriesById.set(assetId, { group, ...normalized });

    if (entry) {
      entry.isRare = true;
      entry.rare = { group, ...normalized };
    }
  } else {
    if (!existing) {
      return;
    }

    const { group } = existing;
    if (group && state.rareCatalog?.[group]) {
      delete state.rareCatalog[group][assetId];
      if (!Object.keys(state.rareCatalog[group]).length) {
        delete state.rareCatalog[group];
      }
    }

    state.rareEntriesById.delete(assetId);

    if (entry) {
      entry.isRare = false;
      entry.rare = null;
    }
  }

  updateAssetButtonShopMetadata(assetId);
  renderAssetList();

  if (state.selectedLayer?.id === assetId) {
    renderShopEditor(state.selectedLayer);
  }
}

function updateRareDetail(assetId, field, value) {
  let rareEntry = state.rareEntriesById?.get(assetId);
  if (!rareEntry) {
    setRareStatus(assetId, true);
    rareEntry = state.rareEntriesById?.get(assetId);
  }

  if (!rareEntry) {
    return;
  }

  const { group } = rareEntry;
  if (!group) {
    return;
  }

  if (!state.rareCatalog[group] || typeof state.rareCatalog[group] !== "object") {
    state.rareCatalog[group] = {};
  }

  const detail = state.rareCatalog[group][assetId] && typeof state.rareCatalog[group][assetId] === "object"
    ? { ...state.rareCatalog[group][assetId] }
    : {};

  if (field === "name") {
    const next = typeof value === "string" ? value.trim() : "";
    if (next) {
      detail.name = next;
    } else {
      delete detail.name;
    }
  } else if (field === "rarity") {
    if (value === "" || value === null || value === undefined) {
      delete detail.rarity;
    } else {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        detail.rarity = parsed;
      } else {
        delete detail.rarity;
      }
    }
  }

  const normalized = normalizeRareDetail(detail);
  state.rareCatalog[group][assetId] = normalized;
  state.rareEntriesById.set(assetId, { group, ...normalized });

  const entryRecord = state.assetIndexById?.get(assetId);
  if (entryRecord) {
    entryRecord.isRare = true;
    entryRecord.rare = { group, ...normalized };
  }

  updateAssetButtonShopMetadata(assetId);

  if (state.selectedLayer?.id === assetId) {
    renderShopEditor(state.selectedLayer);
  }

  renderAssetList();
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

  const rareCount = Array.from(state.rareEntriesById?.values?.() ?? []).length;
  if (rareCount) {
    const rareOption = document.createElement("option");
    rareOption.value = SHOP_OPTION_RARE;
    rareOption.textContent = `Rares (${rareCount})`;
    filter.appendChild(rareOption);
  }
}

function getAssetSizeKey(entry) {
  const hasFrameWidth = typeof entry.frameWidth === "number" && Number.isFinite(entry.frameWidth);
  const hasFrameHeight = typeof entry.frameHeight === "number" && Number.isFinite(entry.frameHeight);
  if (hasFrameWidth && hasFrameHeight) {
    return `frame:${entry.frameWidth}x${entry.frameHeight}`;
  }

  const hasFitX = typeof entry.initialX === "number" && Number.isFinite(entry.initialX);
  const hasFitY = typeof entry.initialY === "number" && Number.isFinite(entry.initialY);
  if (hasFitX && hasFitY) {
    return `fit:${entry.initialX}x${entry.initialY}`;
  }

  return null;
}

function filterAssets() {
  const query = dom.search.value.trim().toLowerCase();
  const categoryFilter = dom.categoryFilter.value;
  const shopFilter = dom.shopFilter?.value ?? "";
  const uniqueSizesOnly = dom.sizeMetadataFilter?.checked ?? false;

  const sizeTracker = new Set();

  return state.assetIndex.filter((entry) => {
    const sizeKey = getAssetSizeKey(entry);
    const matchesQuery = !query ||
      entry.id.toLowerCase().includes(query) ||
      entry.filename.toLowerCase().includes(query) ||
      (entry.rare?.name && entry.rare.name.toLowerCase().includes(query));
    const matchesCategory = !categoryFilter || entry.category === categoryFilter;
    const matchesShop = !shopFilter
      || (shopFilter === SHOP_OPTION_RARE ? entry.isRare : (Array.isArray(entry.shopIds) && entry.shopIds.includes(shopFilter)));

    if (!(matchesQuery && matchesCategory && matchesShop)) {
      return false;
    }

    if (uniqueSizesOnly) {
      if (!sizeKey || sizeTracker.has(sizeKey)) {
        return false;
      }
      sizeTracker.add(sizeKey);
    }

    return true;
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
      const rareSegments = getRareDisplaySegments(entry);
      button.dataset.shops = shopLabels.join(", ");
      button.dataset.rare = rareSegments.join(" · ");
      button.classList.toggle("is-rare", entry.isRare);
      button.title = buildAssetButtonTitle(entry, shopLabels, rareSegments);
      button.addEventListener("click", () => handleAssetSelection(entry));
      container.appendChild(button);
    });

    wrapper.appendChild(container);
    list.appendChild(wrapper);
  });
}

function setAvatarGender(gender) {
  const isInitialSetup = !state.bodyKey && state.baseLayers.size === 0;
  if (!isInitialSetup && state.gender === gender) {
    return;
  }

  state.gender = gender;
  const previouslySelectedLayer = state.selectedLayer;
  clearBaseLayers();

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

  renderLayerPanel();
  if (previouslySelectedLayer) {
    const restoredLayer = state.layers.find((layer) => layer.key === previouslySelectedLayer.key);
    if (restoredLayer) {
      selectLayer(restoredLayer);
    } else {
      updateSelectionPanel();
      updatePivotHandle();
    }
  } else {
    updateSelectionPanel();
    updatePivotHandle();
  }
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

  const layerElements = createLayerElement(entry, { className: "base-layer-item" });
  const element = layerElements?.frontNode;
  if (!element) {
    console.warn(`Unable to create base layer element for ${entry.id}`);
    return true;
  }

  element.dataset.key = entry.key;
  element.style.left = `${placement.x}px`;
  element.style.top = `${placement.y}px`;

  const previous = state.baseLayers.get(slot);
  if (previous?.nodes?.length) {
    previous.nodes.forEach((node) => {
      if (node && node !== dom.baseAvatar) {
        node.remove();
      }
    });
  } else if (previous?.node && previous.node !== dom.baseAvatar) {
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
    frontNode: element,
    nodes: [element],
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
    if (layer?.nodes?.length) {
      layer.nodes.forEach((node) => {
        if (node && node !== dom.baseAvatar) {
          node.remove();
        }
      });
    } else if (layer.node && layer.node !== dom.baseAvatar) {
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

    const result = {
      frontNode: canvas,
      nodes: [canvas],
      frontPlacement: "foreground",
    };

    if (entry.category === "boards" && !entry.metadata?.middleEffect) {
      result.frontPlacement = isBoardLayerAbove(entry.metadata) ? "foreground" : "background";
    }

    return result;
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
  const result = {
    frontNode: img,
    nodes: [img],
    frontPlacement: "foreground",
  };

  if (entry.category === "boards" && !entry.metadata?.middleEffect) {
    result.frontPlacement = isBoardLayerAbove(entry.metadata) ? "foreground" : "background";
  }

  return result;
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

  const created = createLayerElement(entry);
  const frontNode = created?.frontNode;
  if (!frontNode) {
    console.warn(`Unable to create layer element for ${entry.id}`);
    return;
  }

  const nodes = [];
  if (frontNode) {
    nodes.push(frontNode);
  }
  if (created?.nodes?.length) {
    created.nodes.forEach((node) => {
      if (node && !nodes.includes(node)) {
        nodes.push(node);
      }
    });
  }

  const backNode = created?.backNode && created.backNode !== frontNode ? created.backNode : null;
  const frontPlacement = created?.frontPlacement === "background" ? "background" : "foreground";

  nodes.forEach((node) => {
    if (!node) {
      return;
    }
    node.dataset.key = entry.key;
  });

  const initialPosition = resolvePlacement(entry);
  const initialPivot = resolvePivot(entry);

  const layer = {
    key: entry.key,
    id: entry.id,
    category: entry.category,
    filename: entry.filename,
    pathSegments: entry.pathSegments,
    node: frontNode,
    frontNode,
    backNode,
    nodes,
    frontPlacement,
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
  updateLayerPosition(layer, initialPosition.x, initialPosition.y);
  updateLayerOrder();
  selectLayer(layer);
}

function attachDragHandlers(layer) {
  const handleNode = layer?.frontNode;
  if (!handleNode) {
    return;
  }
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
    if (typeof handleNode.setPointerCapture === "function") {
      handleNode.setPointerCapture(event.pointerId);
    }
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
    if (typeof handleNode.releasePointerCapture === "function") {
      handleNode.releasePointerCapture(event.pointerId);
    }
  };

  handleNode.addEventListener("pointerdown", onPointerDown);
  handleNode.addEventListener("pointermove", onPointerMove);
  handleNode.addEventListener("pointerup", onPointerUp);
  handleNode.addEventListener("pointerleave", onPointerUp);
}

function updateLayerOrder() {
  state.layers.forEach((layer, index) => {
    const frontNode = layer.frontNode;
    const backNode = layer.backNode;
    const placeFrontInForeground = layer.frontPlacement !== "background";

    if (backNode && dom.layerBehindContainer) {
      dom.layerBehindContainer.appendChild(backNode);
      backNode.style.zIndex = String(5 + index);
    }

    if (frontNode) {
      const targetContainer = placeFrontInForeground ? dom.layerContainer : dom.layerBehindContainer;
      targetContainer?.appendChild(frontNode);
      frontNode.style.zIndex = String(placeFrontInForeground ? 10 + index : 6 + index);
    }
  });
  renderLayerPanel();
  updatePivotHandle();
}

function renderLayerPanel() {
  dom.layersPanel.innerHTML = "";
  if (dom.clearLayers) {
    dom.clearLayers.disabled = state.layers.length === 0;
  }
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
  const node = layer?.frontNode ?? layer?.node;
  if (!node) {
    return { width: 0, height: 0 };
  }
  const width = node.offsetWidth
    || node.naturalWidth
    || layer.metadata?.frameWidth
    || layer.metadata?.splitX
    || 0;
  const height = node.offsetHeight
    || node.naturalHeight
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
  const nodes = layer?.nodes?.length ? layer.nodes : layer?.frontNode ? [layer.frontNode] : [];
  if (!nodes.length) {
    return;
  }
  const pivotX = clamp(layer?.pivot?.x ?? 0.5, 0, 1);
  const pivotY = clamp(layer?.pivot?.y ?? 0.5, 0, 1);
  layer.pivot = { x: pivotX, y: pivotY };
  nodes.forEach((node) => {
    node.style.transformOrigin = `${pivotX * 100}% ${pivotY * 100}%`;
  });
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
  const nodes = layer?.nodes?.length ? layer.nodes : layer?.frontNode ? [layer.frontNode] : [];
  if (!nodes.length) {
    return;
  }
  const nextVisible = visible !== false;
  layer.visible = nextVisible;
  nodes.forEach((node) => {
    node.style.display = nextVisible ? "" : "none";
  });
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
    entry.frontNode?.classList.toggle("selected", entry.key === layer.key);
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
  const nodes = layer?.nodes?.length ? layer.nodes : layer?.frontNode ? [layer.frontNode] : [];
  nodes.forEach((node) => {
    node.style.left = `${layer.position.x}px`;
    node.style.top = `${layer.position.y}px`;
  });
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
    if (layer?.nodes?.length) {
      layer.nodes.forEach((node) => node?.remove?.());
    } else {
      layer.node?.remove?.();
    }

  }
  state.selectedLayer = null;
  renderLayerPanel();
  updateSelectionPanel();
  updatePivotHandle();
}

function clearAllLayers() {
  if (!state.layers.length) {
    return;
  }

  state.layers.forEach((layer) => {
    if (layer?.nodes?.length) {
      layer.nodes.forEach((node) => node?.remove?.());
    } else {
      layer.node?.remove?.();
    }
  });

  state.layers = [];
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

function computePlacementChanges() {
  const payload = {
    assets: {},
    boards: {},
  };

  const processedKeys = new Set();

  const recordChange = (pathSegments = [], category, type, x, y) => {
    const roundedX = Math.round(coerceNumber(x));
    const roundedY = Math.round(coerceNumber(y));

    if (Number.isNaN(roundedX) || Number.isNaN(roundedY)) {
      return;
    }

    if (category === "boards") {
      const boardId = pathSegments?.[1];
      if (!boardId) {
        return;
      }
      payload.boards[boardId] = {
        offsetX: roundedX,
        offsetY: roundedY,
      };
      return;
    }

    if (!Array.isArray(pathSegments) || !pathSegments.length) {
      return;
    }

    let cursor = payload.assets;
    const keyX = type === "offset" ? "offsetX" : "fitX";
    const keyY = type === "offset" ? "offsetY" : "fitY";

    pathSegments.forEach((segment, idx) => {
      if (idx === pathSegments.length - 1) {
        cursor[segment] = {
          [keyX]: roundedX,
          [keyY]: roundedY,
        };
      } else {
        cursor[segment] = cursor[segment] || {};
        cursor = cursor[segment];
      }
    });
  };

  getAllLayerEntries().forEach((layer) => {
    processedKeys.add(layer.key);
    const hasChanged = layer.position.x !== layer.original.x || layer.position.y !== layer.original.y;
    if (!hasChanged) return;
    recordChange(layer.pathSegments, layer.category, layer.type, layer.position.x, layer.position.y);
  });

  Object.entries(state.savedPlacements ?? {}).forEach(([key, saved]) => {
    if (processedKeys.has(key)) {
      return;
    }
    const entry = state.assetIndexByKey?.get(key);
    if (!entry) {
      return;
    }

    const currentX = Math.round(coerceNumber(saved?.x, entry.initialX));
    const currentY = Math.round(coerceNumber(saved?.y, entry.initialY));
    const originalX = Math.round(coerceNumber(entry.initialX));
    const originalY = Math.round(coerceNumber(entry.initialY));

    if (currentX === originalX && currentY === originalY) {
      return;
    }

    recordChange(entry.pathSegments, entry.category, entry.type, currentX, currentY);
  });

  return payload;
}

function savePlacements() {
  const activeKeys = new Set();

  getAllLayerEntries().forEach((layer) => {
    activeKeys.add(layer.key);
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
  Object.keys(state.savedPlacements).forEach((key) => {
    if (!activeKeys.has(key)) {
      delete state.savedPlacements[key];
    }
  });
  state.savedShopChanges = computeShopChanges();
  state.savedRareChanges = computeRareChanges();
  persistSavedData();
  alert("Placements saved locally.");
}

function downloadMetadata() {
  const payload = computePlacementChanges();
  const shopChanges = computeShopChanges();
  const rareChanges = computeRareChanges();

  if (Object.keys(shopChanges).length) {
    payload.shops = shopChanges;
  }

  if (Object.keys(rareChanges).length) {
    payload.rares = rareChanges;
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

function resetFemaleHeadPlacementsToMetadata() {
  if (!state.savedPlacements || !Array.isArray(state.assetIndex)) {
    return;
  }

  const FEMALE_HEAD_PREFIX = ["heads", "head", "female"];

  state.assetIndex.forEach((entry) => {
    if (!entry?.pathSegments) {
      return;
    }

    const matchesFemaleHead = FEMALE_HEAD_PREFIX.every(
      (segment, index) => entry.pathSegments[index] === segment,
    );

    if (!matchesFemaleHead) {
      return;
    }

    const savedPlacement = state.savedPlacements[entry.key];
    if (!savedPlacement) {
      return;
    }

    const targetX = Math.round(coerceNumber(entry.initialX));
    const targetY = Math.round(coerceNumber(entry.initialY));
    const savedX = Math.round(coerceNumber(savedPlacement.x, targetX));
    const savedY = Math.round(coerceNumber(savedPlacement.y, targetY));

    if (savedX === targetX && savedY === targetY) {
      return;
    }

    state.savedPlacements[entry.key] = {
      ...savedPlacement,
      x: targetX,
      y: targetY,
    };
  });
}

function applySavedShopChanges() {
  if (!state.savedShopChanges || !state.shopCatalogs) {
    return;
  }

  applyShopChangesToCatalogs(state.savedShopChanges, state.shopCatalogs);
}

function applySavedRareChanges() {
  if (!state.savedRareChanges || !state.rareCatalog) {
    return;
  }

  applyRareChanges(state.savedRareChanges, state.rareCatalog);
}

async function init() {
  const [boards, hairAccessoryMetadata, shopCatalogs, rareCatalog] = await Promise.all([
    loadBoardMetadata(),
    loadHairAccessoryMetadata(),
    loadShopCatalogs(),
    loadRareCatalog(),
  ]);
  const hairAccessoryCollection = buildHairAccessoryCollection(hairAccessoryMetadata);
  state.boards = boards;
  state.hairAccessories = hairAccessoryCollection ?? {};
  state.shopCatalogs = shopCatalogs;
  state.shopCatalogBaselines = cloneShopCatalogs(shopCatalogs);
  state.rareCatalog = cloneRareCatalog(rareCatalog);
  state.rareCatalogBaseline = cloneRareCatalog(rareCatalog);
  applySavedShopChanges();
  applySavedRareChanges();
  state.shopAssignments = new Map();
  state.rareEntriesById = buildRareIndex(state.rareCatalog);
  state.assetIndex = buildAssetIndex(
    state.boards,
    hairAccessoryCollection ? { hair_acc: hairAccessoryCollection } : {},
  );
  state.assetIndexById = new Map(state.assetIndex.map((entry) => [entry.id, entry]));
  state.assetIndexByKey = new Map(state.assetIndex.map((entry) => [entry.key, entry]));
  annotateAssetIndexWithShops(state.assetIndex, state.shopCatalogs);
  annotateAssetIndexWithRares(state.assetIndex, state.rareEntriesById);
  const categories = Array.from(new Set(state.assetIndex.map((entry) => entry.category)));
  populateCategoryFilter(categories);
  populateShopFilter(state.shopCatalogs);
  renderAssetList();
  setupLayerResizer();
  setupStageDragging();
  setupPivotHandle();
  applyStageTransform();
  applyStageScale();
  resetFemaleHeadPlacementsToMetadata();
  setAvatarGender("female");
  applySavedPlacementsOnLoad();
}

// event listeners
[
  { element: dom.search, event: "input" },
  { element: dom.categoryFilter, event: "input" },
  { element: dom.shopFilter, event: "change" },
  { element: dom.sizeMetadataFilter, event: "change" },
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

dom.shopSelect?.addEventListener("change", (event) => {
  if (!state.selectedLayer) {
    return;
  }

  const assetId = state.selectedLayer.id;
  const value = event.currentTarget.value;

  if (value === SHOP_OPTION_RARE) {
    setExclusiveShopMembership(assetId, null, { skipRareReset: true });
    setRareStatus(assetId, true, { skipShopReset: true });
  } else {
    setRareStatus(assetId, false);
    setExclusiveShopMembership(assetId, value || null);
  }

  renderShopEditor(state.selectedLayer);
});

dom.shopNameInput?.addEventListener("input", (event) => {
  if (!state.selectedLayer) {
    return;
  }

  const selection = dom.shopSelect?.value;
  const assetId = state.selectedLayer.id;
  const isRareSelection = selection === SHOP_OPTION_RARE || state.rareEntriesById?.has(assetId);

  if (isRareSelection) {
    updateRareDetail(assetId, "name", event.currentTarget.value);
    return;
  }

  const activeShop = getAssignedShopId(assetId);
  if (!activeShop) {
    return;
  }

  updateShopDetail(assetId, activeShop, "name", event.currentTarget.value);
});

dom.shopPriceInput?.addEventListener("input", (event) => {
  if (!state.selectedLayer) {
    return;
  }

  const selection = dom.shopSelect?.value;
  const assetId = state.selectedLayer.id;
  const isRareSelection = selection === SHOP_OPTION_RARE || state.rareEntriesById?.has(assetId);

  if (isRareSelection) {
    updateRareDetail(assetId, "rarity", event.currentTarget.value);
    return;
  }

  const activeShop = getAssignedShopId(assetId);
  if (!activeShop) {
    return;
  }

  updateShopDetail(assetId, activeShop, "cost", event.currentTarget.value);
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
dom.clearLayers?.addEventListener("click", clearAllLayers);
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
