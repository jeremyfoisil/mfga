// Bootstrap — will be completed in Task 7
import { createApp } from 'vue'
import { createPinia } from 'pinia'

const app = createApp({ template: '<div>Loading...</div>' })
app.use(createPinia())
app.mount('#app')
