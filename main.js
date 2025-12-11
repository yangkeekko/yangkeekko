(() => {
  const els = {
    file: document.getElementById('fileInput'),
    dropzone: document.getElementById('dropzone'),
    thumb: document.getElementById('thumb'),
    subtitleHeight: document.getElementById('subtitleHeight'),
    fontSize: document.getElementById('fontSize'),
    fontColor: document.getElementById('fontColor'),
    fontColorVal: document.getElementById('fontColorVal'),
    fontSwatch: document.getElementById('fontSwatch'),
    strokeColor: document.getElementById('strokeColor'),
    strokeColorVal: document.getElementById('strokeColorVal'),
    strokeSwatch: document.getElementById('strokeSwatch'),
    dividerThickness: document.getElementById('dividerThickness'),
    outputWidth: document.getElementById('outputWidth'),
    overlayColor: document.getElementById('overlayColor'),
    overlayColorVal: document.getElementById('overlayColorVal'),
    overlaySwatch: document.getElementById('overlaySwatch'),
    overlayOpacity: document.getElementById('overlayOpacity'),
    overlayOpacityNum: document.getElementById('overlayOpacityNum'),
    subtitleHeightNum: document.getElementById('subtitleHeightNum'),
    fontSizeNum: document.getElementById('fontSizeNum'),
    text: document.getElementById('subtitleText'),
    generate: document.getElementById('generateBtn'),
    save: document.getElementById('saveBtn'),
    status: document.getElementById('status'),
    canvas: document.getElementById('previewCanvas'),
    emptyHint: document.getElementById('emptyHint'),
    toast: document.getElementById('toast'),
    exampleBtn: document.getElementById('exampleBtn'),
    exampleModal: document.getElementById('exampleModal'),
    exampleClose: document.getElementById('exampleClose'),
    exampleCanvas: document.getElementById('exampleCanvas'),
  };

  const ctx = els.canvas.getContext('2d');
  const state = {
    img: null,
    hasGenerated: false,
  };

  const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

  function setStatus(msg, type = 'info') {
    els.status.textContent = msg || '';
    els.status.style.color = type === 'error' ? '#ff6b6b' : '#8aa0b4';
  }

  function showToast(message) {
    const t = els.toast;
    if (!t) return;
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function getParams() {
    const subtitleHeight = clamp(parseInt(els.subtitleHeight.value || '40', 10), 20, 120);
    const fontSize = clamp(parseInt(els.fontSize.value || '20', 10), 12, 72);
    const dividerThickness = clamp(parseInt(els.dividerThickness.value || '1', 10), 1, 4);
    const outputWidth = clamp(parseInt(els.outputWidth.value || '900', 10), 320, 4096);
    const overlayColor = els.overlayColor.value || '#000000';
    const overlayOpacity = clamp(parseFloat(els.overlayOpacity.value ?? '0.4'), 0, 1);
    const fontColor = els.fontColor.value || '#ffffff';
    const strokeColor = els.strokeColor.value || '#000000';
    return { subtitleHeight, fontSize, dividerThickness, fontColor, strokeColor, outputWidth, overlayColor, overlayOpacity };
  }

  function readLines() {
    return (els.text.value || '')
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  function setButtonsState() {
    const hasImg = !!state.img;
    els.generate.disabled = !hasImg;
    els.save.disabled = !state.hasGenerated;
    if (els.save) els.save.hidden = !state.hasGenerated;
    if (els.emptyHint) els.emptyHint.hidden = !!state.img;
    // 未选择图片时隐藏预览画布，避免出现灰色占位块
    if (els.canvas) els.canvas.hidden = !hasImg;
  }

  function drawWithDPR(imgW, imgH, drawFn) {
    const dpr = window.devicePixelRatio || 1;
    els.canvas.width = Math.round(imgW * dpr);
    els.canvas.height = Math.round(imgH * dpr);
    // 为了移动端不变形：使用响应式显示尺寸
    els.canvas.style.width = '100%';
    els.canvas.style.height = 'auto';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFn();
  }

  // 基于原图底部裁剪一块与字幕高度相同的区域，作为所有行的背景
  function buildBackgroundTile(img, blockH, outW, scale, overlayColor, overlayOpacity) {
    const tile = document.createElement('canvas');
    tile.width = outW;
    tile.height = blockH;
    const tctx = tile.getContext('2d');
    const sx = 0;
    const sourceH = Math.max(1, Math.round(blockH / (scale || 1))); // 按原图坐标的裁剪高度
    const sy = Math.max(0, img.height - sourceH);
    const sw = img.width;
    const sh = sourceH;
    // 裁剪原图底部区域，并缩放到 outW x blockH
    tctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, blockH);
    // 叠加用户设置的半透明蒙层以提升可读性
    const rgba = hexToRgba(overlayColor, overlayOpacity);
    tctx.fillStyle = rgba;
    tctx.fillRect(0, 0, outW, blockH);
    return tile;
  }

  function generate() {
    if (!state.img) {
      setStatus('请先选择图片', 'error');
      return;
    }
    const lines = readLines();
    if (lines.length === 0) {
      setStatus('未检测到字幕行，请输入文本', 'error');
      return;
    }
    const { subtitleHeight, fontSize, dividerThickness, fontColor, strokeColor, outputWidth, overlayColor, overlayOpacity } = getParams();
    const img = state.img;
    // 等比缩放到指定导出宽度
    const scale = outputWidth / img.width;
    const imgW = outputWidth;
    const imgH = Math.round(img.height * scale);

    // 第一行覆盖在主图底部；其余行堆叠在主图下方
    const appendedCount = Math.max(0, lines.length - 1);
    const totalH = appendedCount * subtitleHeight + (appendedCount > 0 ? appendedCount * dividerThickness : 0);
    const startY = imgH; // 堆叠区起点（主图底部之后）

    // 先构建一张“字幕背景图”，随后每一行复用以保证完全一致
    const backgroundTile = buildBackgroundTile(img, subtitleHeight, imgW, scale, overlayColor, overlayOpacity);

    drawWithDPR(imgW, imgH + totalH, () => {
      // 原图置顶
      // 将原图缩放到目标宽度并绘制
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, imgW, imgH);

      // 第一行：直接覆盖到主图底部
      {
        const y0 = imgH - subtitleHeight;
        ctx.drawImage(backgroundTile, 0, y0);
        ctx.font = `${fontSize}px Microsoft YaHei, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(1, Math.round(fontSize / 10));
        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = fontColor;
        const cx = imgW / 2;
        const cy = y0 + subtitleHeight / 2;
        try { ctx.strokeText(lines[0], cx, cy); } catch (_) {}
        ctx.fillText(lines[0], cx, cy);
      }

      // 如有更多行，则在主图下方堆叠绘制
      if (appendedCount > 0) {
        // 第一行与第二行之间的分割线（位于主图底部之后）
        ctx.fillStyle = strokeColor;
        ctx.fillRect(0, imgH, imgW, dividerThickness);

        let y = startY; // 从主图下方开始
        for (let i = 1; i < lines.length; i++) {
          ctx.drawImage(backgroundTile, 0, y);
          // 文本
          ctx.font = `${fontSize}px Microsoft YaHei, Arial, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = Math.max(1, Math.round(fontSize / 10));
          ctx.strokeStyle = strokeColor;
          ctx.fillStyle = fontColor;
          const cx = imgW / 2;
          const cy = y + subtitleHeight / 2;
          try { ctx.strokeText(lines[i], cx, cy); } catch (_) {}
          ctx.fillText(lines[i], cx, cy);

          // 下方分割线（最后一行不画）
          if (i < lines.length - 1) {
            ctx.fillStyle = strokeColor;
            ctx.fillRect(0, y + subtitleHeight, imgW, dividerThickness);
          }
          y += subtitleHeight + dividerThickness;
        }
      }
    });

    state.hasGenerated = true;
    setButtonsState();
    setStatus('生成完成，可保存图片');
    showToast('生成成功');
  }

  function saveImage() {
    if (!state.hasGenerated) return;
    const url = els.canvas.toDataURL('image/png');
    const name = (els.file.files[0]?.name || 'image').replace(/\.[^.]+$/, '') + '_subtitle.png';
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setStatus('已保存PNG到本地');
    showToast('保存成功');
  }

  function loadImageFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        state.img = img;
        state.hasGenerated = false;
        setButtonsState();
        setStatus('图片加载成功，请输入字幕并生成');
        showToast('图片加载成功');
        // 可选：先画原图以示预览
        drawWithDPR(img.width, img.height, () => ctx.drawImage(img, 0, 0, img.width, img.height));
        if (els.thumb) {
          els.thumb.src = reader.result;
          els.thumb.hidden = false;
        }
        if (els.dropzone) {
          els.dropzone.firstChild && (els.dropzone.firstChild.textContent = '已选择图片，可点击或拖拽替换');
        }
      };
      img.src = reader.result;
    };
    reader.onerror = () => setStatus('读取图片失败', 'error');
    reader.readAsDataURL(file);
  }

  // 拖拽/点击上传支持
  function setupDropzone() {
    const z = els.dropzone;
    if (!z) return;
    const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
    ['dragenter','dragover'].forEach(ev => z.addEventListener(ev, (e) => { prevent(e); z.classList.add('dragover'); }));
    ['dragleave','dragend'].forEach(ev => z.addEventListener(ev, (e) => { prevent(e); z.classList.remove('dragover'); }));
    z.addEventListener('drop', (e) => {
      prevent(e);
      z.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      state.img = null;
      state.hasGenerated = false;
      setButtonsState();
      if (!files || files.length === 0) {
        setStatus('未检测到文件', 'error');
        return;
      }
      const file = files[0];
      const ok = ['image/png','image/jpeg'].includes(file.type) || /\.(png|jpg|jpeg)$/i.test(file.name);
      if (!ok) { setStatus('仅支持 png/jpg/jpeg 格式', 'error'); return; }
      loadImageFile(file);
    });
    z.addEventListener('click', () => {
      els.file?.click();
    });
  }


  // 事件绑定
  els.file.addEventListener('change', (e) => {
    const file = e.target.files[0];
    state.img = null;
    state.hasGenerated = false;
    setButtonsState();
    if (!file) {
      setStatus('未选择图片');
      return;
    }
    const ok = /\.(png|jpg|jpeg)$/i.test(file.name);
    if (!ok) {
      setStatus('仅支持 png/jpg/jpeg 格式', 'error');
      return;
    }
    loadImageFile(file);
  });


  els.generate.addEventListener('click', generate);
  els.save.addEventListener('click', saveImage);
  setupDropzone();

  // 颜色即时回显
  const reflectColor = (input, out, swatch) => {
    if (!input || !out) return;
    const sync = () => {
      const v = (input.value || '').toLowerCase();
      out.textContent = v;
      if (swatch) swatch.style.setProperty('--swatch-color', v);
    };
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    sync();
  };
  reflectColor(els.fontColor, els.fontColorVal, els.fontSwatch);
  reflectColor(els.strokeColor, els.strokeColorVal, els.strokeSwatch);
  reflectColor(els.overlayColor, els.overlayColorVal, els.overlaySwatch);

  // 滑杆数值回显
  const reflectRange = (input, out, fmt) => {
    if (!input || !out) return;
    const sync = () => { out.textContent = fmt ? fmt(parseFloat(input.value)) : String(parseInt(input.value, 10)); };
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    sync();
  };

  // 滑杆与数字输入联动
  function linkRangeNumber(rangeEl, numberEl, outEl, min, max, step = 1, fmt) {
    if (!rangeEl || !numberEl) return;
    const clampLocal = (v) => clamp(v, min, max);
    const syncFromRange = () => {
      const v = clampLocal(parseFloat(rangeEl.value));
      numberEl.value = String(v);
      if (outEl) outEl.textContent = fmt ? fmt(v) : String(Math.round(v));
    };
    const syncFromNumber = () => {
      const v = clampLocal(parseFloat(numberEl.value));
      rangeEl.value = String(v);
      if (outEl) outEl.textContent = fmt ? fmt(v) : String(Math.round(v));
    };
    rangeEl.min = String(min); rangeEl.max = String(max); rangeEl.step = String(step);
    numberEl.min = String(min); numberEl.max = String(max); numberEl.step = String(step);
    rangeEl.addEventListener('input', syncFromRange);
    rangeEl.addEventListener('change', syncFromRange);
    numberEl.addEventListener('input', syncFromNumber);
    numberEl.addEventListener('change', syncFromNumber);
    syncFromRange();
  }

  linkRangeNumber(els.subtitleHeight, els.subtitleHeightNum, null, 20, 120, 1);
  linkRangeNumber(els.fontSize, els.fontSizeNum, null, 12, 72, 1);
  linkRangeNumber(els.overlayOpacity, els.overlayOpacityNum, null, 0, 1, 0.01, (v)=>v.toFixed(2));

  // 产品示例图加载失败则隐藏
  const ps = document.getElementById('productSample');
  if (ps) {
    ps.addEventListener('error', () => { ps.style.display = 'none'; });
  }

  // 初始状态
  setButtonsState();
  setStatus('请选择图片开始');
})();
  function hexToRgba(hex, alpha = 1) {
    try {
      const h = hex.replace('#', '');
      const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } catch (_) {
      return `rgba(0,0,0,${alpha})`;
    }
  }

  // 示例弹窗渲染（等待 DOM 完成后绑定，避免初始即弹出/无法关闭）
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('exampleBtn');
    const modal = document.getElementById('exampleModal');
    const closeBtn = document.getElementById('exampleClose');
    const canvas = document.getElementById('exampleCanvas');
    if (!btn || !modal || !closeBtn || !canvas) return;
    const cctx = canvas.getContext('2d');

    function draw(img) {
      const lines = ['从来没用过另可的人', '会被这个时代抛弃', '赶快使用另可', '添加你的任意字幕'];
      const subtitleHeight = 40;
      const fontSize = 24;
      const dividerThickness = 1;
      const outputWidth = 400;
      const overlayColor = '#000000';
      const overlayOpacity = 0.4;
      const fontColor = '#ffffff';
      const strokeColor = '#000000';
      const lineWidth = Math.max(1, Math.round(fontSize / 10));

      const scale = outputWidth / img.width;
      const imgW = outputWidth;
      const imgH = Math.round(img.height * scale);

      const appendedCount = Math.max(0, lines.length - 1);
      const totalH = appendedCount * subtitleHeight + (appendedCount > 0 ? appendedCount * dividerThickness : 0);

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round((imgW) * dpr);
      canvas.height = Math.round((imgH + totalH) * dpr);
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 构建背景块
      const tile = document.createElement('canvas');
      tile.width = imgW; tile.height = subtitleHeight;
      const tctx = tile.getContext('2d');
      const sourceH = Math.max(1, Math.round(subtitleHeight / scale));
      const sy = Math.max(0, img.height - sourceH);
      tctx.drawImage(img, 0, sy, img.width, sourceH, 0, 0, imgW, subtitleHeight);
      tctx.fillStyle = hexToRgba(overlayColor, overlayOpacity);
      tctx.fillRect(0, 0, imgW, subtitleHeight);

      // 主图
      cctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, imgW, imgH);
      // 第一行覆盖
      const y0 = imgH - subtitleHeight;
      cctx.drawImage(tile, 0, y0);
      cctx.font = `${fontSize}px Microsoft YaHei, Arial, sans-serif`;
      cctx.textAlign = 'center';
      cctx.textBaseline = 'middle';
      cctx.lineWidth = lineWidth;
      cctx.strokeStyle = strokeColor; cctx.fillStyle = fontColor;
      const cx = imgW / 2; const cy0 = y0 + subtitleHeight / 2;
      try { cctx.strokeText(lines[0], cx, cy0); } catch(_) {}
      cctx.fillText(lines[0], cx, cy0);

      // 其它行堆叠
      if (appendedCount > 0) {
        cctx.fillStyle = strokeColor;
        cctx.fillRect(0, imgH, imgW, dividerThickness);
        let y = imgH;
        for (let i = 1; i < lines.length; i++) {
          cctx.drawImage(tile, 0, y);
          const cy = y + subtitleHeight / 2;
          // 保持与第一行完全一致的样式
          cctx.font = `${fontSize}px Microsoft YaHei, Arial, sans-serif`;
          cctx.lineWidth = lineWidth;
          cctx.strokeStyle = strokeColor; cctx.fillStyle = fontColor;
          try { cctx.strokeText(lines[i], cx, cy); } catch(_) {}
          cctx.fillText(lines[i], cx, cy);
          if (i < lines.length - 1) {
            cctx.fillStyle = strokeColor;
            cctx.fillRect(0, y + subtitleHeight, imgW, dividerThickness);
          }
          y += subtitleHeight + dividerThickness;
        }
      }
    }

    function openModal() {
      modal.hidden = false;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => draw(img);
      img.onerror = () => {
        const ph = document.createElement('canvas');
        ph.width = 400; ph.height = 266;
        const pctx = ph.getContext('2d');
        pctx.fillStyle = '#e5e7eb';
        pctx.fillRect(0,0,ph.width, ph.height);
        img.width = ph.width; img.height = ph.height;
        draw(img);
      };
      img.src = 'https://image.xyzcdn.net/FiDpg83Zj5DHllwhNqzHRuJW8NE7.png@small';
    }
    function closeModal() { modal.hidden = true; }

    btn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e)=>{ if (e.target === modal) closeModal(); });
    window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeModal(); });
  });
