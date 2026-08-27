/* Set apiUrl after deploying the Supabase Edge Function. Leave blank only while migrating legacy content. */
window.WorksheetConfig = {
  apiUrl: "https://aujngibvchwonbnsywjl.supabase.co/functions/v1/worksheets"
};
const catalogueStyles = document.createElement('link');
catalogueStyles.rel = 'stylesheet';
catalogueStyles.href = 'css/catalogue-enhancements.css';
document.head.append(catalogueStyles);
