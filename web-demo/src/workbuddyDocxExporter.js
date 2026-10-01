import { Packer } from 'docx';
import { buildWorkBuddyDocument, serializeWorkBuddyDocument } from './workbuddyDocxBuilder.js';

function safeFileName(value) {
  return String(value || '结构计算统一措施').replace(/[\\/:*?"<>|]/g, '-').trim();
}

async function exportWorkBuddyWord() {
  const trigger = window.event?.currentTarget;
  const previousText = trigger?.textContent;
  try {
    if (trigger) {
      trigger.disabled = true;
      trigger.textContent = '正在生成 DOCX…';
    }
    const snapshot = serializeWorkBuddyDocument();
    let snapshotNode = window.document.querySelector('#__workbuddy-word-snapshot');
    if (!snapshotNode) {
      snapshotNode = window.document.createElement('script');
      snapshotNode.id = '__workbuddy-word-snapshot';
      snapshotNode.type = 'application/json';
      window.document.body.appendChild(snapshotNode);
    }
    snapshotNode.textContent = JSON.stringify(snapshot);
    const blob = await Packer.toBlob(buildWorkBuddyDocument(snapshot));
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(snapshot.projectName)}_结构计算统一措施_A3横向双栏.docx`;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    window.toast?.('已生成真正的 DOCX：A3 横向、双栏、孟博版式');
  } catch (error) {
    console.error(error);
    window.alert(`Word 生成失败：${error.message}`);
  } finally {
    if (trigger) {
      trigger.disabled = false;
      trigger.textContent = previousText;
    }
  }
}

window.exportWord = exportWorkBuddyWord;
window.__serializeWorkBuddyDocument = serializeWorkBuddyDocument;
