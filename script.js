(() => {
  'use strict';
  const DEFAULT_BACKGROUND_COLOR = '#FFFFFF';
  const DEFAULT_FOREGROUND_COLOR = '#000000';
  const DEMO_COLOR = '#FF6D00';
  const canvas = document.getElementById('pixelCanvas');
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  let displayWidth = 520;
  let displayHeight = 520;
  let dpr = window.devicePixelRatio || 1;
  let isExporting = false; // 导出锁
  // ==================== Canvas 尺寸 ====================
  function resizeCanvas() {
    if (isExporting) return;
    const container = document.getElementById('previewCanvas');
    const rect = container.getBoundingClientRect();
    displayWidth = Math.floor(rect.width);
    displayHeight = Math.floor(rect.height);
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;
    renderPreview();
  }
  // ==================== DOM Elements ====================
  const fileInput = document.getElementById('fileInput');
  const errorEl = document.getElementById('error');
  const uploadPreview = document.getElementById('uploadPreview');
  const uploadIcon = document.getElementById('uploadIcon');
  const emptyState = document.getElementById('emptyState');
  const previewCanvas = document.getElementById('previewCanvas');
  const exportPNGButton = document.getElementById('exportPNG');
  const exportSVGButton = document.getElementById('exportSVG');
  const resetLabel = document.querySelector('.panel__reset-label');
  const gridSizeSlider = document.getElementById('gridSize');
  const edgeSlider = document.getElementById('edgeThreshold');
  const detailSlider = document.getElementById('detailLevel');
  const lineSlider = document.getElementById('lineThickness');
  const outlineSlider = document.getElementById('outlineThickness');
  const gridSizeVal = document.getElementById('gridSizeVal');
  const edgeThresholdVal = document.getElementById('edgeThresholdVal');
  const detailLevelVal = document.getElementById('detailLevelVal');
  const lineThicknessVal = document.getElementById('lineThicknessVal');
  const outlineThicknessVal = document.getElementById('outlineThicknessVal');
  const bgSwatches = Array.from(document.querySelectorAll('.bg-swatch[data-color]'));
  const customBgPicker = document.getElementById('customBgPicker');
  const fgSwatches = Array.from(document.querySelectorAll('.fg-swatch[data-color]'));
  const customFgPicker = document.getElementById('customFgPicker');
  const styleButtons = document.querySelectorAll('.style-button');
  // ==================== 状态变量 ====================
  let styleMode = 'square';
  let processedImage = null;
  let demoImage = null;
  let hasImage = false;
  let gridSize = 10,edgeThreshold = 30,detailLevel = 1,lineThickness = 1,outlineThickness = 5;
  let backgroundColor = DEFAULT_BACKGROUND_COLOR;
  let foregroundColor = DEFAULT_FOREGROUND_COLOR;
  let offsetX = 0,offsetY = 0;
  let isDragging = false;
  let dragStartX = 0,dragStartY = 0;
  let cachedEdges = null;
  let typingTimeout = null;
  // ==================== 防重复点击机制 ====================
  let exportClickTime = 0;
  const MIN_CLICK_INTERVAL = 2000; // 2秒内不允许重复点击
  // ==================== 背景填充 ====================
  function fillCanvasBackground(color) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.scale(dpr, dpr);
  }
  // ==================== 渲染预览 ====================
  function renderPreview() {
    if (!processedImage && !demoImage) return;
    const image = processedImage || demoImage;
    if (previewCanvas.style.backgroundColor !== backgroundColor) fillCanvasBackground(backgroundColor);
    if (cachedEdges === null) cachedEdges = detectEdges(image.preview, edgeThreshold, detailLevel);
    const uniformScale = Math.min(displayWidth / image.previewWidth, displayHeight / image.previewHeight);
    const canvasOffsetX = (displayWidth - image.previewWidth * uniformScale) / 2 + offsetX;
    const canvasOffsetY = (displayHeight - image.previewHeight * uniformScale) / 2 + offsetY;
    renderPixels(ctx, cachedEdges, image.previewWidth, image.previewHeight, uniformScale, canvasOffsetX, canvasOffsetY, Math.max(1, gridSize));
  }
  // ==================== 动态文字 ====================
  function getReadableTextColor(hex) {
    const normalized = hex.replace('#', '').trim();
    const expanded = normalized.length === 3 ? normalized.split('').map(c => c + c).join('') : normalized;
    const r = parseInt(expanded.slice(0, 2), 16);
    const g = parseInt(expanded.slice(2, 4), 16);
    const b = parseInt(expanded.slice(4, 6), 16);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return lum > 0.5 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.68)';
  }
  function updateBackgroundVisuals() {
    previewCanvas.style.backgroundColor = backgroundColor;
    emptyState.style.backgroundColor = backgroundColor;
    emptyState.style.color = getReadableTextColor(backgroundColor);
    const chars = document.querySelectorAll('.typing-char');
    if (hasImage || backgroundColor !== DEFAULT_BACKGROUND_COLOR) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
      emptyState.classList.add('hidden');
      chars.forEach(c => c.classList.remove('typing-char--visible'));
    } else {
      emptyState.classList.remove('hidden');
      if (!typingTimeout) runTypingAnimation(chars);
    }
  }
  function runTypingAnimation(chars) {
    let i = 0;
    emptyState.classList.remove('hidden');
    function typeNext() {
      if (i < chars.length) {
        chars[i].classList.add('typing-char--visible');
        i++;
        typingTimeout = setTimeout(typeNext, 35);
      } else {
        typingTimeout = setTimeout(() => {
          chars.forEach(c => c.classList.remove('typing-char--visible'));
          i = 0;
          typingTimeout = setTimeout(typeNext, 500);
        }, 1000);
      }
    }
    typeNext();
  }
  // ==================== 图像处理 ====================
  function detectEdges(imageData, edgeThresholdValue, detailLevelValue) {
    const { data, width, height } = imageData;
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) gray[i] = data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11;
    const magnitude = new Float32Array(width * height);
    const direction = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const gx = gray[(y - 1) * width + (x + 1)] + 2 * gray[y * width + (x + 1)] + gray[(y + 1) * width + (x + 1)] - (
      gray[(y - 1) * width + (x - 1)] + 2 * gray[y * width + (x - 1)] + gray[(y + 1) * width + (x - 1)]);
      const gy = gray[(y - 1) * width + (x - 1)] + 2 * gray[(y - 1) * width + x] + gray[(y - 1) * width + (x + 1)] - (
      gray[(y + 1) * width + (x - 1)] + 2 * gray[(y + 1) * width + x] + gray[(y + 1) * width + (x + 1)]);
      const idx = y * width + x;
      magnitude[idx] = Math.sqrt(gx * gx + gy * gy) / 4;
      direction[idx] = Math.atan2(gy, gx);
    }
    const edges = [],weakEdges = [];
    const factor = 1 - (detailLevelValue - 1) / 29 * 0.75;
    const high = Math.max(edgeThresholdValue * factor, 1);
    const low = high * 0.4;
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (magnitude[idx] <= low) continue;
      let dir = (direction[idx] * 180 / Math.PI + 180) % 180;
      let d = dir < 22.5 || dir >= 157.5 ? 0 : dir < 67.5 ? 45 : dir < 112.5 ? 90 : 135;
      let n1, n2;
      if (d === 0) {n1 = magnitude[idx - 1];n2 = magnitude[idx + 1];} else
      if (d === 45) {n1 = magnitude[idx + width - 1];n2 = magnitude[idx - width + 1];} else
      if (d === 90) {n1 = magnitude[idx - width];n2 = magnitude[idx + width];} else
      {n1 = magnitude[idx + width + 1];n2 = magnitude[idx - width - 1];}
      if (magnitude[idx] >= n1 && magnitude[idx] >= n2) {
        if (magnitude[idx] >= high) edges.push(idx);else
        weakEdges.push(idx);
      }
    }
    const edgeSet = new Set(edges);
    const connected = new Set();
    weakEdges.forEach(idx => {
      const y = Math.floor(idx / width);
      const x = idx % width;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nIdx = (y + dy) * width + x + dx;
        if (edgeSet.has(nIdx)) {connected.add(idx);break;}
      }
    });
    return [...edges, ...Array.from(connected)];
  }
  function prepareImage(image) {
    const w = image.naturalWidth || image.width;
    const h = image.naturalHeight || image.height;
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = w;fullCanvas.height = h;
    const fullCtx = fullCanvas.getContext('2d');
    fullCtx.drawImage(image, 0, 0, w, h);
    const target = 360;
    const maxDim = Math.max(w, h);
    const scale = maxDim > target ? target / maxDim : 1;
    const pw = Math.max(1, Math.round(w * scale));
    const ph = Math.max(1, Math.round(h * scale));
    const previewCanvasEl = document.createElement('canvas');
    previewCanvasEl.width = pw;previewCanvasEl.height = ph;
    const previewCtx = previewCanvasEl.getContext('2d');
    previewCtx.imageSmoothingEnabled = false;
    previewCtx.drawImage(image, 0, 0, pw, ph);
    const preview = previewCtx.getImageData(0, 0, pw, ph);
    return { preview, previewWidth: pw, previewHeight: ph };
  }
  function calculateShapeParams(x, y, uniformScale, canvasOffsetX, canvasOffsetY, isExport = false) {
    const baseSize = uniformScale * gridSize;
    const thicknessFactor = 1 + (lineThickness - 1) * 0.25;
    const rectSize = baseSize * thicknessFactor;
    const thicknessOffset = (rectSize - baseSize) / 2;
    const drawX = canvasOffsetX + x * uniformScale - thicknessOffset;
    const drawY = canvasOffsetY + y * uniformScale - thicknessOffset;
    return { drawX, drawY, rectSize, baseSize };
  }
  function renderPixels(targetCtx, edges, previewWidth, previewHeight, uniformScale, canvasOffsetX, canvasOffsetY, step) {
    targetCtx.imageSmoothingEnabled = false;
    const isExport = targetCtx.canvas.width === 2880 || targetCtx.canvas.height === 3840;
    const pixelRatio = isExport ? 1 : dpr;

    for (let i = 0; i < edges.length; i += step) {
      const index = edges[i];
      const y = Math.floor(index / previewWidth);
      const x = index % previewWidth;
      const p = calculateShapeParams(x, y, uniformScale, canvasOffsetX, canvasOffsetY, isExport);

      if (styleMode === 'square') {
        targetCtx.fillStyle = foregroundColor;
        targetCtx.fillRect(p.drawX, p.drawY, p.rectSize, p.rectSize);
      } else if (styleMode === 'circle') {
        const cx = p.drawX + p.rectSize / 2;
        const cy = p.drawY + p.rectSize / 2;
        const r = p.rectSize / 2;
        targetCtx.fillStyle = foregroundColor;
        targetCtx.beginPath();
        targetCtx.arc(cx, cy, r, 0, Math.PI * 2);
        targetCtx.fill();
      } else if (styleMode === 'filled') {
        const cx = p.drawX + p.rectSize / 2;
        const cy = p.drawY + p.rectSize / 2;
        const baseRadius = p.rectSize / 2;
        const maxStroke = baseRadius * 1.1;
        const minStroke = baseRadius * 0.07;
        const blackStroke = minStroke + (maxStroke - minStroke) * (outlineThickness - 1) / 9 * (isExport ? 1 : pixelRatio);
        targetCtx.fillStyle = '#000';
        targetCtx.beginPath();
        targetCtx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
        targetCtx.fill();
        const innerRadius = Math.max(baseRadius - blackStroke, 0);
        if (innerRadius > 0.4) {
          targetCtx.fillStyle = foregroundColor;
          targetCtx.beginPath();
          targetCtx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
          targetCtx.fill();
        }
      }
    }
  }
  // ==================== 颜色 & Reset ====================
  function setBackgroundColor(color) {
    backgroundColor = color.toUpperCase();
    customBgPicker.value = color;
    bgSwatches.forEach(s => {var _s$dataset$color;return s.classList.toggle('active', ((_s$dataset$color = s.dataset.color) === null || _s$dataset$color === void 0 ? void 0 : _s$dataset$color.toUpperCase()) === color);});
    updateBackgroundVisuals();
    renderPreview();
  }
  function setForegroundColor(color) {
    foregroundColor = color.toUpperCase();
    customFgPicker.value = color;
    fgSwatches.forEach(s => {var _s$dataset$color2;return s.classList.toggle('active', ((_s$dataset$color2 = s.dataset.color) === null || _s$dataset$color2 === void 0 ? void 0 : _s$dataset$color2.toUpperCase()) === color);});
    renderPreview();
  }
  function resetSettings() {
    gridSize = 10;edgeThreshold = 30;detailLevel = 1;lineThickness = 1;outlineThickness = 5;
    gridSizeSlider.value = 10;gridSizeVal.textContent = '10';
    edgeSlider.value = 30;edgeThresholdVal.textContent = '30';
    detailSlider.value = 1;detailLevelVal.textContent = '1';
    lineSlider.value = 1;lineThicknessVal.textContent = '1';
    outlineSlider.value = 5;outlineThicknessVal.textContent = '5';
    setBackgroundColor(DEFAULT_BACKGROUND_COLOR);
    setForegroundColor(DEFAULT_FOREGROUND_COLOR);
    styleButtons.forEach(b => b.classList.remove('active'));
    document.querySelector('[data-style="square"]').classList.add('active');
    styleMode = 'square';
    offsetX = offsetY = 0;
    cachedEdges = null;
  }
  function resetAll() {
    resetSettings();
    processedImage = null;demoImage = null;hasImage = false;
    uploadPreview.src = '';uploadPreview.classList.add('hidden');
    uploadIcon.classList.remove('hidden');
    canvas.style.cursor = 'default';
    fillCanvasBackground(backgroundColor);
    updateBackgroundVisuals();
    fileInput.value = '';
  }
  // ==================== 拖拽 ====================
  canvas.addEventListener('mousedown', e => {
    if (!hasImage || e.button !== 0) return;
    isDragging = true;
    dragStartX = e.clientX - offsetX;
    dragStartY = e.clientY - offsetY;
    canvas.style.cursor = 'grabbing';
    previewCanvas.classList.add('dragging');
  });
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    offsetX = e.clientX - dragStartX;
    offsetY = e.clientY - dragStartY;
    renderPreview();
  });
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      canvas.style.cursor = 'grab';
      previewCanvas.classList.remove('dragging');
    }
  });
  // ==================== 下载 ====================
  function downloadBlob(blob, filename) {
    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
      window.navigator.msSaveOrOpenBlob(blob, filename);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
  // ==================== 导出 PNG ====================
  function handleExportPNG(event) {
    // 防止事件冒泡和默认行为
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const now = Date.now();
    // 防重复点击检查
    if (now - exportClickTime < MIN_CLICK_INTERVAL) {
      console.log('点击过于频繁，请稍后再试');
      return;
    }

    if (!hasImage || isExporting) return;

    // 立即设置导出状态
    exportClickTime = now;
    isExporting = true;

    // 禁用按钮并添加视觉反馈
    exportPNGButton.disabled = true;
    exportPNGButton.style.opacity = '0.6';
    exportPNGButton.style.cursor = 'not-allowed';
    exportPNGButton.textContent = '导出中...';
    const image = processedImage || demoImage;
    if (cachedEdges === null) cachedEdges = detectEdges(image.preview, edgeThreshold, detailLevel);
    const EXPORT_WIDTH = 2880,EXPORT_HEIGHT = 3840;
    const scale = Math.min(EXPORT_WIDTH / image.previewWidth, EXPORT_HEIGHT / image.previewHeight);
    const ox = (EXPORT_WIDTH - image.previewWidth * scale) / 2;
    const oy = (EXPORT_HEIGHT - image.previewHeight * scale) / 2;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = EXPORT_WIDTH;exportCanvas.height = EXPORT_HEIGHT;
    const xctx = exportCanvas.getContext('2d', { alpha: false });
    xctx.fillStyle = backgroundColor;
    xctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
    renderPixels(xctx, cachedEdges, image.previewWidth, image.previewHeight, scale, ox, oy, Math.max(1, gridSize));
    // 使用Promise确保流程完整
    new Promise(resolve => {
      exportCanvas.toBlob(blob => {
        downloadBlob(blob, `pixel-outline-${Date.now()}.png`);
        resolve();
      }, 'image/png', 1.0);
    }).finally(() => {
      // 恢复按钮状态
      setTimeout(() => {
        isExporting = false;
        exportPNGButton.disabled = false;
        exportPNGButton.style.opacity = '1';
        exportPNGButton.style.cursor = 'pointer';
        exportPNGButton.textContent = '导出 PNG';
      }, 1000);
    });
  }
  // ==================== 导出 SVG ====================
  function handleExportSVG(event) {
    // 防止事件冒泡和默认行为
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const now = Date.now();
    // 防重复点击检查
    if (now - exportClickTime < MIN_CLICK_INTERVAL) {
      console.log('点击过于频繁，请稍后再试');
      return;
    }

    if (!hasImage || isExporting) return;

    // 立即设置导出状态
    exportClickTime = now;
    isExporting = true;

    // 禁用按钮并添加视觉反馈
    exportSVGButton.disabled = true;
    exportSVGButton.style.opacity = '0.6';
    exportSVGButton.style.cursor = 'not-allowed';
    exportSVGButton.textContent = '导出中...';
    const image = processedImage || demoImage;
    if (cachedEdges === null) cachedEdges = detectEdges(image.preview, edgeThreshold, detailLevel);

    // 使用与PNG导出相同的尺寸和计算逻辑
    const EXPORT_WIDTH = 2880,EXPORT_HEIGHT = 3840;
    const scale = Math.min(EXPORT_WIDTH / image.previewWidth, EXPORT_HEIGHT / image.previewHeight);
    const ox = (EXPORT_WIDTH - image.previewWidth * scale) / 2;
    const oy = (EXPORT_HEIGHT - image.previewHeight * scale) / 2;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svgEl = document.createElementNS(svgNS, 'svg');
    svgEl.setAttribute('xmlns', svgNS);
    svgEl.setAttribute('width', EXPORT_WIDTH);
    svgEl.setAttribute('height', EXPORT_HEIGHT);
    svgEl.setAttribute('viewBox', `0 0 ${EXPORT_WIDTH} ${EXPORT_HEIGHT}`);

    // 背景
    const bgRect = document.createElementNS(svgNS, 'rect');
    bgRect.setAttribute('x', 0);
    bgRect.setAttribute('y', 0);
    bgRect.setAttribute('width', EXPORT_WIDTH);
    bgRect.setAttribute('height', EXPORT_HEIGHT);
    bgRect.setAttribute('fill', backgroundColor);
    svgEl.appendChild(bgRect);
    // 创建SVG元素的辅助函数
    const createSVGElement = (type, attrs) => {
      const el = document.createElementNS(svgNS, type);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      return el;
    };
    // 渲染所有边缘点
    for (let i = 0; i < cachedEdges.length; i += Math.max(1, gridSize)) {
      const index = cachedEdges[i];
      const y = Math.floor(index / image.previewWidth);
      const x = index % image.previewWidth;

      // 使用与PNG导出相同的参数计算
      const baseSize = scale * gridSize;
      const thicknessFactor = 1 + (lineThickness - 1) * 0.25;
      const rectSize = baseSize * thicknessFactor;
      const thicknessOffset = (rectSize - baseSize) / 2;
      const drawX = ox + x * scale - thicknessOffset;
      const drawY = oy + y * scale - thicknessOffset;
      if (styleMode === 'square') {
        svgEl.appendChild(createSVGElement('rect', {
          x: drawX,
          y: drawY,
          width: rectSize,
          height: rectSize,
          fill: foregroundColor }));

      } else if (styleMode === 'circle') {
        const cx = drawX + rectSize / 2;
        const cy = drawY + rectSize / 2;
        const r = rectSize / 2;
        svgEl.appendChild(createSVGElement('circle', {
          cx: cx,
          cy: cy,
          r: r,
          fill: foregroundColor }));

      } else if (styleMode === 'filled') {
        const cx = drawX + rectSize / 2;
        const cy = drawY + rectSize / 2;
        const baseRadius = rectSize / 2;
        const maxStroke = baseRadius * 1.1;
        const minStroke = baseRadius * 0.07;
        const blackStroke = minStroke + (maxStroke - minStroke) * (outlineThickness - 1) / 9;

        // 外层黑色圆
        svgEl.appendChild(createSVGElement('circle', {
          cx: cx,
          cy: cy,
          r: baseRadius,
          fill: '#000' }));


        // 内层彩色圆
        const innerRadius = Math.max(baseRadius - blackStroke, 0);
        if (innerRadius > 0.4) {
          svgEl.appendChild(createSVGElement('circle', {
            cx: cx,
            cy: cy,
            r: innerRadius,
            fill: foregroundColor }));

        }
      }
    }
    const blob = new Blob([new XMLSerializer().serializeToString(svgEl)], { type: 'image/svg+xml' });
    downloadBlob(blob, `pixel-outline-${Date.now()}.svg`);

    // 恢复按钮状态
    setTimeout(() => {
      isExporting = false;
      exportSVGButton.disabled = false;
      exportSVGButton.style.opacity = '1';
      exportSVGButton.style.cursor = 'pointer';
      exportSVGButton.textContent = '导出 SVG';
    }, 1000);
  }
  // ==================== 初始化 ====================
  function init() {
    resizeCanvas();
    fillCanvasBackground(backgroundColor);
    updateBackgroundVisuals();
    window.addEventListener('resize', resizeCanvas);

    // 移除所有现有的事件监听器，然后重新绑定
    const newPNGButton = exportPNGButton.cloneNode(true);
    const newSVGButton = exportSVGButton.cloneNode(true);
    exportPNGButton.parentNode.replaceChild(newPNGButton, exportPNGButton);
    exportSVGButton.parentNode.replaceChild(newSVGButton, exportSVGButton);

    // 重新获取按钮引用
    const cleanPNGButton = document.getElementById('exportPNG');
    const cleanSVGButton = document.getElementById('exportSVG');

    // 使用一次性事件绑定
    cleanPNGButton.addEventListener('click', handleExportPNG, { once: false });
    cleanSVGButton.addEventListener('click', handleExportSVG, { once: false });

    resetLabel.addEventListener('click', resetAll);
    fileInput.addEventListener('change', e => {
      if (!e.target.files.length) return;
      const f = e.target.files[0];
      if (!f.type.startsWith('image/')) return errorEl.textContent = '请上传图片';
      const img = new Image();
      img.onload = () => {
        resetSettings();
        processedImage = prepareImage(img);
        hasImage = true;cachedEdges = null;
        uploadPreview.src = URL.createObjectURL(f);
        uploadPreview.classList.remove('hidden');
        uploadIcon.classList.add('hidden');
        canvas.style.cursor = 'grab';
        renderPreview();
        updateBackgroundVisuals();
      };
      img.src = URL.createObjectURL(f);
    });
    bgSwatches.forEach(s => {
      s.addEventListener('click', () => setBackgroundColor(s.dataset.color));
    });
    customBgPicker.addEventListener('input', e => setBackgroundColor(e.target.value));
    fgSwatches.forEach(s => {
      s.addEventListener('click', () => setForegroundColor(s.dataset.color));
    });
    customFgPicker.addEventListener('input', e => setForegroundColor(e.target.value));
    styleButtons.forEach(b => {
      b.addEventListener('click', () => {
        styleButtons.forEach(s => s.classList.remove('active'));
        b.classList.add('active');
        styleMode = b.dataset.style;
        if (styleMode === 'filled' && foregroundColor === '#000000') {
          setForegroundColor(DEMO_COLOR);
          customFgPicker.classList.add('active');
        }
        renderPreview();
      });
    });
    // slider 绑定
    gridSizeSlider.addEventListener('input', e => {gridSize = e.target.value;gridSizeVal.textContent = e.target.value;cachedEdges = null;renderPreview();});
    edgeSlider.addEventListener('input', e => {edgeThreshold = e.target.value;edgeThresholdVal.textContent = e.target.value;cachedEdges = null;renderPreview();});
    detailSlider.addEventListener('input', e => {detailLevel = e.target.value;detailLevelVal.textContent = e.target.value;cachedEdges = null;renderPreview();});
    lineSlider.addEventListener('input', e => {lineThickness = e.target.value;lineThicknessVal.textContent = e.target.value;renderPreview();});
    outlineSlider.addEventListener('input', e => {outlineThickness = e.target.value;outlineThicknessVal.textContent = e.target.value;renderPreview();});
  }
  // 确保只初始化一次
  if (!window.pixelToolInitialized) {
    init();
    window.pixelToolInitialized = true;
  }
})();