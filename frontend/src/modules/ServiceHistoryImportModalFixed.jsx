import ServiceHistoryImportModal from './ServiceHistoryImportModal.jsx'

// Compatibility wrapper only. The previous implementation used a MutationObserver
// to mutate React-owned table cells directly. That could race React reconciliation
// after a large Excel import and cause the production white-screen render crash.
export default function ServiceHistoryImportModalFixed(props) {
  return <ServiceHistoryImportModal {...props} />
}
