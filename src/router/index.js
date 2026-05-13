import Vue from 'vue';
import VueRouter from 'vue-router';
import Login from '../views/login/Login.vue';

Vue.use(VueRouter);

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/sterilizationMonitor',
    name: 'SterilizationMonitor',
    component: () => import('../views/home/SterilizationMonitor.vue')
  }
];

const router = new VueRouter({
  mode: 'hash',
  base: process.env.BASE_URL,
  routes
});

export default router;
