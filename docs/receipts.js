export function initReceipts(api, friendlyError) {
  const dialog = document.querySelector('#receiptDialog');
  const form = document.querySelector('#receiptForm');
  const image = document.querySelector('#receiptImage');
  const status = document.querySelector('#receiptStatus');
  const close = document.querySelector('#closeReceipt');
  const print = document.querySelector('#printReceipt');
  const printImage = document.querySelector('#receiptPrint');
  print.onclick = async () => {
    printImage.src = image.src;
    try {
      await printImage.decode();
      if (dialog.open && !image.hidden && printImage.src === image.src) window.print();
    } catch {
      printImage.removeAttribute('src');
      status.textContent = 'Nie udało się przygotować zdjęcia do druku.';
    }
  };
  window.addEventListener('afterprint', () => printImage.removeAttribute('src'));
  const remove = document.querySelector('#removeReceipt');
  let version = 0;
  let entryId;

  async function update(request, message, writing = false) {
    const current = ++version;
    form.inert = true;
    close.disabled = writing;
    status.textContent = message;
    try {
      const receipt = await request(entryId);
      if (current !== version || !dialog.open) return;
      if (receipt) image.src = 'data:' + receipt.mime + ';base64,' + receipt.image_base64;
      else image.removeAttribute('src');
      image.hidden = remove.hidden = print.hidden = !receipt;
      status.textContent = receipt ? '' : 'Brak zdjęcia paragonu.';
    } catch (error) {
      if (current === version && dialog.open) status.textContent = friendlyError(error);
    } finally {
      if (current === version) form.inert = close.disabled = false;
    }
  }

  dialog.oncancel = event => { if (close.disabled) event.preventDefault(); };
  close.onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    version++;
    image.removeAttribute('src');
    printImage.removeAttribute('src');
    form.reset();
  });
  form.onsubmit = event => {
    event.preventDefault();
    const file = form.elements.photo.files[0];
    if (!file) return;
    update(async id => {
      const photo = await encodePhoto(file);
      if (!dialog.open || id !== entryId) return null;
      await api('receipt-save', {entry_id: id, ...photo});
      form.reset();
      return photo;
    }, 'Zapisywanie zdjęcia…', true);
  };
  remove.onclick = () => {
    if (!confirm('Usunąć zdjęcie paragonu?')) return;
    update(async id => {
      await api('receipt-remove', id);
      return null;
    }, 'Usuwanie zdjęcia…', true);
  };
  return id => {
    entryId = id;
    image.hidden = remove.hidden = print.hidden = true;
    dialog.showModal();
    update(id => api('receipt', id), 'Pobieranie zdjęcia…');
  };
}

async function encodePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw Error('Wybierz zdjęcie JPEG, PNG lub WebP.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image_base64 = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
    if (!image_base64 || image_base64.length > 1398104) throw Error('Zdjęcie jest za duże. Wybierz mniejszy plik.');
    return {mime: 'image/jpeg', image_base64};
  } finally {
    bitmap.close();
  }
}
