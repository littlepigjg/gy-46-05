import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

export const getUrls = () => api.get('/urls')
export const addUrl = (data) => api.post('/urls', data)
export const deleteUrl = (id) => api.delete(`/urls/${id}`)
export const updateUrl = (id, data) => api.put(`/urls/${id}`, data)
export const getUrl = (id) => api.get(`/urls/${id}`)
export const getScreenshots = (urlId) => api.get(`/urls/${urlId}/screenshots`)
export const deleteScreenshot = (id) => api.delete(`/screenshots/${id}`)
export const triggerScreenshot = (urlId) => api.post(`/urls/${urlId}/screenshot`)
export const getScreenshot = (id) => api.get(`/screenshots/${id}`)

export const getAnnotations = (screenshotId) => api.get(`/screenshots/${screenshotId}/annotations`)
export const createAnnotation = (screenshotId, data) => api.post(`/screenshots/${screenshotId}/annotations`, data)
export const updateAnnotation = (id, data) => api.put(`/annotations/${id}`, data)
export const deleteAnnotation = (id) => api.delete(`/annotations/${id}`)
export const batchCreateAnnotations = (screenshotId, annotations) => api.post(`/screenshots/${screenshotId}/annotations/batch`, { annotations })
export const exportAnnotations = (screenshotId) => api.get(`/screenshots/${screenshotId}/annotations/export`, { responseType: 'blob' })

export default api
