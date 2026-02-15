export function createContextMenuUI(deps) {
  const {
    clamp,
    invGrid,
    bankGrid,
    eqWeaponSlot,
    eqOffhandSlot,
    eqQuiverSlot,
    inv,
    bank
  } = deps;

  const ctxMenu = document.createElement("div");
  ctxMenu.className = "ctxmenu hidden";
  document.body.appendChild(ctxMenu);

  const itemTooltip = document.createElement("div");
  itemTooltip.className = "itemTooltip hidden";
  document.body.appendChild(itemTooltip);

  function closeCtxMenu() {
    ctxMenu.classList.add("hidden");
    ctxMenu.innerHTML = "";
  }

  function closeItemTooltip() {
    itemTooltip.classList.add("hidden");
    itemTooltip.textContent = "";
  }

  function moveItemTooltip(clientX, clientY) {
    if (itemTooltip.classList.contains("hidden")) return;
    const pad = 10;
    const xOff = 14;
    const yOff = 16;
    const rect = itemTooltip.getBoundingClientRect();
    const x = clamp(clientX + xOff, pad, window.innerWidth - rect.width - pad);
    const y = clamp(clientY + yOff, pad, window.innerHeight - rect.height - pad);
    itemTooltip.style.left = `${x}px`;
    itemTooltip.style.top = `${y}px`;
  }

  function openItemTooltip(text, clientX, clientY) {
    if (!text) {
      closeItemTooltip();
      return;
    }
    itemTooltip.textContent = text;
    itemTooltip.classList.remove("hidden");
    moveItemTooltip(clientX, clientY);
  }

  function showSlotTooltip(e, arr) {
    const slot = e.target.closest(".slot");
    if (!slot) {
      closeItemTooltip();
      return;
    }
    const idx = parseInt(slot.dataset.index, 10);
    if (!Number.isFinite(idx) || !arr[idx]) {
      closeItemTooltip();
      return;
    }
    openItemTooltip(slot.dataset.tooltip || "", e.clientX, e.clientY);
  }

  function showElementTooltip(e) {
    const el = e.currentTarget;
    if (!el) return;
    openItemTooltip(el.dataset.tooltip || "", e.clientX, e.clientY);
  }

  function openCtxMenu(clientX, clientY, options) {
    ctxMenu.innerHTML = "";
    for (const opt of options) {
      if (opt.type === "sep") {
        const sep = document.createElement("div");
        sep.className = "sep";
        ctxMenu.appendChild(sep);
        continue;
      }
      const b = document.createElement("button");
      if (opt.className) b.classList.add(opt.className);
      b.textContent = opt.label;
      b.onclick = () => {
        closeCtxMenu();
        opt.onClick();
      };
      ctxMenu.appendChild(b);
    }

    ctxMenu.classList.remove("hidden");
    const rect = ctxMenu.getBoundingClientRect();
    const pad = 8;
    ctxMenu.style.left = `${clamp(clientX, pad, window.innerWidth - rect.width - pad)}px`;
    ctxMenu.style.top = `${clamp(clientY, pad, window.innerHeight - rect.height - pad)}px`;
  }

  document.addEventListener("mousedown", (e) => {
    if (!ctxMenu.classList.contains("hidden") && !ctxMenu.contains(e.target)) {
      closeCtxMenu();
    }
    closeItemTooltip();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeCtxMenu();
      closeItemTooltip();
    }
  });

  window.addEventListener("blur", () => {
    closeCtxMenu();
    closeItemTooltip();
  });

  invGrid.addEventListener("mousemove", (e) => showSlotTooltip(e, inv));
  bankGrid.addEventListener("mousemove", (e) => showSlotTooltip(e, bank));
  invGrid.addEventListener("mouseleave", closeItemTooltip);
  bankGrid.addEventListener("mouseleave", closeItemTooltip);

  if (eqWeaponSlot) {
    eqWeaponSlot.addEventListener("mousemove", showElementTooltip);
    eqWeaponSlot.addEventListener("mouseleave", closeItemTooltip);
  }
  if (eqOffhandSlot) {
    eqOffhandSlot.addEventListener("mousemove", showElementTooltip);
    eqOffhandSlot.addEventListener("mouseleave", closeItemTooltip);
  }
  if (eqQuiverSlot) {
    eqQuiverSlot.addEventListener("mousemove", showElementTooltip);
    eqQuiverSlot.addEventListener("mouseleave", closeItemTooltip);
  }

  return {
    openCtxMenu,
    closeCtxMenu
  };
}
