import ServiceFeaturePage from './ServiceFeaturePage.jsx'
import ServiceCompletionPanel from './ServiceCompletionPanel.jsx'

export function ServicePage({ profile }) {
  return <>
    <ServiceCompletionPanel profile={profile} />
    <ServiceFeaturePage profile={profile} />
  </>
}

export { default as RentalPage } from './RentalFeaturePage.jsx'
export { default as DocumentsPage } from './DocumentsFeaturePage.jsx'
export { default as ReportsPage } from './ReportsFeaturePage.jsx'
export { default as UsersPage } from './UsersFeaturePage.jsx'
