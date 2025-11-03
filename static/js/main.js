// 全局变量
let currentVisitorId = null;
let currentUser = null;
let authToken = null;
let venues = [];
let events = [];
let map = null;
let markers = [];
const API_BASE_URL = '/api';

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    console.log('页面加载完成');
    
    // 初始化导航
    initNavigation();
    
    // 从本地存储中获取用户认证信息
    authToken = localStorage.getItem('authToken');
    if (authToken) {
        // 验证token并获取用户信息
        getCurrentUser();
    } else {
        // 清除过期的访客信息
        localStorage.removeItem('visitorId');
        currentVisitorId = null;
    }
    
    // 初始化事件监听器
    initEventListeners();
    
    // 加载场馆数据
    loadVenues();
    
    // 初始化搜索功能
    initSearch();
    
    // 初始化地图（默认显示的是场馆地图，所以需要立即初始化）
    if (document.getElementById('venueMap').classList.contains('active')) {
        console.log('页面默认显示地图，立即初始化');
        setTimeout(initMap, 500);
    }
});

// 获取当前用户信息
function getCurrentUser() {
    fetch(`${API_BASE_URL}/current_user`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => {
        if (!response.ok) {
            // 如果Token无效，清除本地存储
            localStorage.removeItem('authToken');
            localStorage.removeItem('visitorId');
            authToken = null;
            currentVisitorId = null;
            updateUIForLoggedOut();
            throw new Error('认证已过期，请重新登录');
        }
        return response.json();
    })
    .then(user => {
        console.log('获取到当前用户:', user);
        currentUser = user;
        currentVisitorId = user.visitor_id;
        
        // 更新UI显示已登录状态
        updateUIForLoggedIn(user);
        
        // 如果是管理员或场馆管理员，显示管理员面板入口
        if (user.role === 'admin' || user.role === 'venue_manager') {
            document.getElementById('adminPanelLink').style.display = 'block';
        }
    })
    .catch(error => {
        console.error('获取用户信息失败:', error);
    });
}

// 更新UI为已登录状态
function updateUIForLoggedIn(user) {
    // 导航栏显示用户名
    document.getElementById('usernameDisplay').textContent = user.username;
    
    // 显示用户下拉菜单，隐藏登录/注册按钮
    document.getElementById('userDropdown').style.display = 'block';
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('registerBtn').style.display = 'none';
    
    // 更新预约页面的用户信息
    document.getElementById('visitorLoginAlert').classList.add('d-none');
    document.getElementById('visitorInfoPanel').classList.remove('d-none');
    document.getElementById('visitorWelcomeName').textContent = user.username;
    document.getElementById('visitorDetails').textContent = 
        `${user.gender || ''} | ${user.age_group || ''} | ${user.occupation_type || ''}`;
    
    // 加载我的预约数据
    loadMyReservations();
}

// 更新UI为未登录状态
function updateUIForLoggedOut() {
    // 隐藏用户下拉菜单，显示登录/注册按钮
    document.getElementById('userDropdown').style.display = 'none';
    document.getElementById('loginBtn').style.display = 'block';
    document.getElementById('registerBtn').style.display = 'block';
    
    // 更新预约页面的提示
    if (document.getElementById('visitorLoginAlert')) {
        document.getElementById('visitorLoginAlert').classList.remove('d-none');
    }
    if (document.getElementById('visitorInfoPanel')) {
        document.getElementById('visitorInfoPanel').classList.add('d-none');
    }
    
    // 如果正在显示管理面板，切换到首页
    if (document.getElementById('adminPanel') && !document.getElementById('adminPanel').classList.contains('d-none')) {
        document.querySelector('.nav-link[data-section="venueMap"]').click();
    }
}

// 加载场馆数据
function loadVenues() {
    console.log('开始加载场馆数据...');
    
    // 显示加载中提示
    const venueCardsContainer = document.getElementById('venueCards');
    if (venueCardsContainer) {
        venueCardsContainer.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2">正在加载场馆信息...</p>
            </div>
        `;
    }
    
    fetch(`${API_BASE_URL}/venues`)
        .then(response => {
            console.log('场馆API响应状态:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP错误: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('获取到场馆数据:', data);
            
            if (!data || !Array.isArray(data)) {
                console.error('场馆数据不是数组格式');
                if (venueCardsContainer) {
                    venueCardsContainer.innerHTML = '<div class="col-12 text-center py-5"><div class="alert alert-danger">获取到的场馆数据格式不正确</div></div>';
                }
                return;
            }
            
            console.log(`获取到 ${data.length} 条场馆数据`);
            venues = data;
            
            // 填充场馆过滤器
            try {
                populateVenueFilter(venues);
            } catch (e) {
                console.error('填充场馆过滤器失败:', e);
            }
            
            // 加载场馆选项（用于预约和访问记录）
            try {
                loadVenueOptions();
            } catch (e) {
                console.error('加载场馆选项失败:', e);
            }
            
            // 显示场馆卡片
            try {
                displayVenueCards();
            } catch (e) {
                console.error('显示场馆卡片失败:', e);
                if (venueCardsContainer) {
                    venueCardsContainer.innerHTML = `<div class="col-12 text-center py-5"><div class="alert alert-danger">显示场馆卡片时出错: ${e.message}</div></div>`;
                }
            }
        })
        .catch(error => {
            console.error('加载场馆数据错误:', error);
            if (venueCardsContainer) {
                venueCardsContainer.innerHTML = `
                    <div class="col-12 text-center py-5">
                        <div class="alert alert-danger">
                            加载场馆数据失败: ${error.message}<br>
                            请刷新页面重试
                        </div>
                    </div>
                `;
            }
        });
}

// 显示场馆卡片
function displayVenueCards() {
    const container = document.getElementById('venueCards');
    container.innerHTML = '';
    
    if (!venues || venues.length === 0) {
        container.innerHTML = '<div class="col-12 text-center py-5"><p class="text-muted">暂无场馆数据</p></div>';
        return;
    }
    
    venues.forEach(venue => {
        const col = document.createElement('div');
        col.className = 'col-md-4 mb-4';
        
        col.innerHTML = `
            <div class="card h-100 shadow-sm">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="card-title">${venue.name}</h5>
                        <span class="badge bg-primary">${venue.type}</span>
                    </div>
                    <p class="card-text">${venue.address}</p>
                    <p class="small text-muted mb-0">开放时间: ${venue.opening_hours}</p>
                </div>
                <div class="card-footer bg-white">
                    <button class="btn btn-sm btn-outline-primary venue-detail-btn" data-venue-id="${venue.venue_id}">
                        详情
                    </button>
                </div>
            </div>
        `;
        
        container.appendChild(col);
    });
    
    // 添加详情按钮点击事件
    document.querySelectorAll('.venue-detail-btn').forEach(button => {
        button.addEventListener('click', function() {
            const venueId = this.getAttribute('data-venue-id');
            showVenueDetail(venueId);
        });
    });
}

// 初始化地图
function initMap() {
    console.log('初始化地图...');
    
    try {
        // 如果没有场馆数据，则不初始化地图
        if (!venues || venues.length === 0) {
            console.warn('没有场馆数据，不初始化地图');
            const mapContainer = document.getElementById('mapContainer');
            if (mapContainer) {
                mapContainer.innerHTML = '<div class="alert alert-warning">暂无场馆数据</div>';
            }
            return;
        }
        
        // 确保AMap对象存在
        if (typeof AMap === 'undefined') {
            console.error('AMap未定义，高德地图API可能未加载');
            const mapContainer = document.getElementById('mapContainer');
            if (mapContainer) {
                mapContainer.innerHTML = '<div class="alert alert-danger">地图加载失败：地图API未加载，请刷新页面重试</div>';
            }
            return;
        }
        
        // 创建地图实例
        const mapContainer = document.getElementById('mapContainer');
        if (!mapContainer) {
            console.error('地图容器元素不存在');
            return;
        }
        
        // 显示加载中提示
        mapContainer.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2">正在加载地图...</p></div>';
        
        // 创建地图
        map = new AMap.Map('mapContainer', {
            resizeEnable: true,
            zoom: 12,
            center: [114.2862, 30.5810]  // 武汉市中心坐标
        });
        
        // 地图加载完成事件
        map.on('complete', function() {
            console.log('地图加载完成');
            
            // 添加地图控件
            try {
                // 直接添加控件，不再使用plugin方式加载
                map.addControl(new AMap.Scale());
                map.addControl(new AMap.ToolBar());
            } catch (e) {
                console.error('添加地图控件失败:', e);
            }
            
            // 添加场馆标记
            setTimeout(function() {
                try {
                    addVenueMarkers();
                } catch (e) {
                    console.error('添加场馆标记失败:', e);
                }
            }, 300);
        });
    } catch (error) {
        console.error('初始化地图错误:', error);
        const mapContainer = document.getElementById('mapContainer');
        if (mapContainer) {
            mapContainer.innerHTML = `<div class="alert alert-danger">地图加载失败：${error.message}</div>`;
        }
    }
}

// 添加场馆标记
function addVenueMarkers() {
    console.log('添加场馆标记...');
    // 清除现有标记
    if (markers.length > 0) {
        map.remove(markers);
        markers = [];
    }
    
    // 创建场馆类型图标样式Map
    const markerStyles = {
        '图书馆': 'marker-library',
        '博物馆': 'marker-museum',
        '美术馆': 'marker-gallery',
        '文化中心': 'marker-cultural'
    };
    
    try {
        // 创建地理编码对象
        const geocoder = new AMap.Geocoder();
        
        // 创建标记点
        let completedGeocodes = 0;
        venues.forEach(venue => {
            // 使用地理编码服务获取地址的经纬度
            geocoder.getLocation(venue.address, function(status, result) {
                completedGeocodes++;
                
                if (status === 'complete' && result.info === 'OK') {
                    const location = result.geocodes[0].location;
                    
                    // 创建标记内容
                    const markerContent = document.createElement('div');
                    markerContent.className = `venue-marker ${markerStyles[venue.type] || 'marker-library'}`;
                    markerContent.innerHTML = venue.type.charAt(0);  // 使用类型首字母
                    
                    // 创建标记
                    const marker = new AMap.Marker({
                        position: [location.lng, location.lat],
                        content: markerContent,
                        title: venue.name,
                        offset: new AMap.Pixel(-15, -15)
                    });
                    
                    // 添加点击事件
                    marker.on('click', function() {
                        showVenueDetail(venue.venue_id);
                    });
                    
                    // 将标记添加到地图
                    marker.setMap(map);
                    markers.push(marker);
                } else {
                    console.warn(`无法解析场馆地址: ${venue.name}, ${venue.address}`);
                }
                
                // 确保地图能显示所有标记
                if (completedGeocodes === venues.length && markers.length > 0) {
                    map.setFitView(markers);
                }
            });
        });
    } catch (error) {
        console.error('添加场馆标记错误:', error);
    }
}

// 初始化导航
function initNavigation() {
    console.log('初始化导航');
    const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
    
    // 激活默认选项卡
    const defaultTab = document.querySelector('.navbar-nav .nav-link[data-section="venueMap"]');
    if (defaultTab) {
        defaultTab.classList.add('active');
    }
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // 移除所有导航链接的active类
            navLinks.forEach(l => l.classList.remove('active'));
            
            // 为当前链接添加active类
            this.classList.add('active');
            
            // 获取目标部分ID
            const targetSectionId = this.getAttribute('data-section');
            console.log('切换到部分:', targetSectionId);
            
            // 隐藏所有内容部分
            document.querySelectorAll('.content-section').forEach(section => {
                section.classList.add('d-none');
                section.classList.remove('active');
            });
            
            // 显示目标部分
            const targetSection = document.getElementById(targetSectionId);
            if (targetSection) {
                targetSection.classList.remove('d-none');
                targetSection.classList.add('active');
                
                // 根据不同的部分加载相应的数据
                switch (targetSectionId) {
                    case 'venueMap':
                        if (!map) {
                            // 延迟初始化地图，确保容器已加载
                            console.log('延迟初始化地图');
                            setTimeout(initMap, 300);
                        } else {
                            console.log('地图已初始化，刷新地图视图');
                            // 如果地图已存在，刷新一下视图
                            map.setFitView();
                        }
                        break;
                    case 'analytics':
                        loadAnalyticsData();
                        break;
                    case 'events':
                        loadEvents();
                        break;
                    case 'feedback':
                        loadFeedbackData();
                        break;
                }
            }
        });
    });
    
    // 页脚快速链接
    document.querySelectorAll('footer a[data-section]').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetSectionId = this.getAttribute('data-section');
            // 找到并点击对应的导航项
            document.querySelector(`.navbar-nav .nav-link[data-section="${targetSectionId}"]`).click();
        });
    });
}

// 初始化事件监听器
function initEventListeners() {
    // 登录表单提交
    document.getElementById('loginSubmitBtn').addEventListener('click', function() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        if (!username || !password) {
            showLoginError('请填写用户名和密码');
            return;
        }
        
        // 清除之前的错误信息
        document.getElementById('loginError').classList.add('d-none');
        
        // 提交登录请求
        fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showLoginError(data.error);
                return;
            }
            
            if (data.token) {
                // 保存认证信息
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('visitorId', data.visitor_id);
                authToken = data.token;
                currentVisitorId = data.visitor_id;
                
                // 获取完整用户信息
                getCurrentUser();
                
                // 关闭登录模态框
                const loginModal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
                loginModal.hide();
                
                // 清空登录表单
                document.getElementById('loginForm').reset();
            }
        })
        .catch(error => {
            console.error('登录请求失败:', error);
            showLoginError('登录请求失败，请稍后重试');
        });
    });
    
    // 注册表单提交
    document.getElementById('registerSubmitBtn').addEventListener('click', function() {
        const form = document.getElementById('registerForm');
        const formData = new FormData(form);
        
        // 构建注册数据
        const registerData = {
            username: formData.get('username'),
            password: formData.get('password'),
            email: formData.get('email'),
            phone: formData.get('phone'),
            age_group: formData.get('age_group'),
            occupation_type: formData.get('occupation_type'),
            gender: formData.get('gender'),
            education_level: formData.get('education_level')
        };
        
        // 检查必要字段
        if (!registerData.username || !registerData.password || !registerData.email || 
            !registerData.age_group || !registerData.occupation_type || 
            !registerData.gender || !registerData.education_level) {
            showRegisterError('请填写所有必填项');
            return;
        }
        
        // 清除之前的错误信息
        document.getElementById('registerError').classList.add('d-none');
        
        // 提交注册请求
        fetch(`${API_BASE_URL}/visitors`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(registerData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showRegisterError(data.error);
                return;
            }
            
            if (data.token) {
                // 保存认证信息
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('visitorId', data.visitor_id);
                authToken = data.token;
                currentVisitorId = data.visitor_id;
                
                // 获取完整用户信息
                getCurrentUser();
                
                // 关闭注册模态框
                const registerModal = bootstrap.Modal.getInstance(document.getElementById('registerModal'));
                registerModal.hide();
                
                // 清空注册表单
                form.reset();
                
                // 显示成功信息
                alert('注册成功，您已自动登录！');
            }
        })
        .catch(error => {
            console.error('注册请求失败:', error);
            showRegisterError('注册请求失败，请稍后重试');
        });
    });
    
    // 退出登录
    document.getElementById('logoutLink').addEventListener('click', function(e) {
        e.preventDefault();
        
        // 如果有认证令牌，调用退出登录API
        if (authToken) {
            fetch(`${API_BASE_URL}/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            })
            .then(response => {
                // 无论成功失败，都清除本地存储
                localStorage.removeItem('authToken');
                localStorage.removeItem('visitorId');
                authToken = null;
                currentVisitorId = null;
                currentUser = null;
                
                // 更新UI
                updateUIForLoggedOut();
                
                // 返回首页
                document.querySelector('.nav-link[data-section="venueMap"]').click();
            })
            .catch(error => {
                console.error('退出登录请求失败:', error);
                // 即使API请求失败，也清除本地存储和更新UI
                localStorage.removeItem('authToken');
                localStorage.removeItem('visitorId');
                authToken = null;
                currentVisitorId = null;
                currentUser = null;
                updateUIForLoggedOut();
            });
        } else {
            // 如果没有令牌，只需要清除UI
            updateUIForLoggedOut();
        }
    });
    
    // 个人信息修改按钮
    document.getElementById('changeVisitorBtn').addEventListener('click', function() {
        loadUserProfile();
    });
    
    // 个人信息链接
    document.getElementById('profileLink').addEventListener('click', function(e) {
        e.preventDefault();
        loadUserProfile();
    });
    
    // 我的预约链接
    document.getElementById('myReservationsLink').addEventListener('click', function(e) {
        e.preventDefault();
        // 切换到预约页面的"我的预约"标签
        document.querySelector('.nav-link[data-section="reservation"]').click();
        setTimeout(() => {
            document.querySelector('#reservationTabs a[href="#myReservations"]').click();
        }, 200);
    });
    
    // 管理后台链接
    if (document.getElementById('adminPanelLink')) {
        document.getElementById('adminPanelLink').querySelector('a').addEventListener('click', function(e) {
            if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'venue_manager')) {
                e.preventDefault();
                alert('您没有权限访问管理后台');
                return;
            }
            
            // 初次加载管理员数据
            if (this.getAttribute('data-first-load') !== 'true') {
                loadAdminData();
                this.setAttribute('data-first-load', 'true');
            }
        });
    }
    
    // 趋势周期选择变更
    document.getElementById('trendPeriodSelect').addEventListener('change', function() {
        loadVisitorTrends(this.value);
    });
    
    // 时间分布类型选择变更
    document.getElementById('timeDistributionTypeSelect').addEventListener('change', function() {
        loadTimeDistribution(this.value);
    });
    
    // 活动过滤器
    document.getElementById('eventTypeFilter').addEventListener('change', filterEvents);
    document.getElementById('venueFilter').addEventListener('change', filterEvents);
    
    // 预约场馆选择变更
    document.getElementById('reservationVenueSelect').addEventListener('change', function() {
        const venueId = this.value;
        if (venueId) {
            loadVenueEvents(venueId, 'reservationEventSelect');
            document.getElementById('reservationEventSelect').disabled = false;
        } else {
            document.getElementById('reservationEventSelect').disabled = true;
            document.getElementById('reservationEventSelect').innerHTML = '<option value="">请先选择场馆...</option>';
            document.getElementById('submitReservationBtn').disabled = true;
            hideEventPreview();
        }
    });
    
    // 预约活动选择变更
    document.getElementById('reservationEventSelect').addEventListener('change', function() {
        const eventId = this.value;
        if (eventId) {
            document.getElementById('submitReservationBtn').disabled = false;
            showEventPreview(eventId);
        } else {
            document.getElementById('submitReservationBtn').disabled = true;
            hideEventPreview();
        }
    });
    
    // 提交预约按钮
    document.getElementById('submitReservationBtn').addEventListener('click', function() {
        const eventId = document.getElementById('reservationEventSelect').value;
        if (!eventId || !authToken) return;
        
        submitReservation(eventId);
    });
    
    // 访问记录表单提交
    document.getElementById('visitRecordForm').addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (!authToken) {
            alert('请先登录');
            return;
        }
        
        const formData = new FormData(this);
        const visitData = {
            venue_id: formData.get('venue_id'),
            event_id: formData.get('event_id') || null,
            satisfaction_rating: formData.get('satisfaction_rating') || null,
            feedback: formData.get('feedback') || null
        };
        
        if (!visitData.venue_id) {
            alert('请选择场馆');
            return;
        }
        
        // 提交访问记录
        fetch(`${API_BASE_URL}/visits`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(visitData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert('提交失败：' + data.error);
                return;
            }
            
            if (data.visit_id) {
                alert('访问记录已提交，感谢您的反馈！');
                this.reset();
            }
        })
        .catch(error => {
            console.error('访问记录提交错误:', error);
            alert('提交失败，请稍后重试');
        });
    });
    
    // 预约活动按钮（活动详情模态框中）
    document.getElementById('reserveEventBtn').addEventListener('click', function() {
        const eventId = this.getAttribute('data-event-id');
        if (!eventId) return;
        
        if (!authToken) {
            alert('请先登录，才能进行预约');
            // 关闭当前模态框
            const eventDetailModal = bootstrap.Modal.getInstance(document.getElementById('eventDetailModal'));
            eventDetailModal.hide();
            
            // 打开登录模态框
            const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
            loginModal.show();
            return;
        }
        
        submitReservation(eventId);
    });
    
    // 个人信息相关事件监听
    document.getElementById('profileLink').addEventListener('click', function(e) {
        e.preventDefault();
        loadUserProfile();
    });
    
    document.getElementById('updateProfileBtn').addEventListener('click', updateUserProfile);
    
    // 管理后台相关事件监听
    const adminPanelLink = document.getElementById('adminPanelLink');
    if (adminPanelLink) {
        adminPanelLink.addEventListener('click', function() {
            loadAdminData();
        });
    }
    
    // 活动管理相关事件监听
    document.getElementById('createEventBtn').addEventListener('click', function() {
        // 打开创建活动模态框
        document.getElementById('eventModalTitle').textContent = '创建活动';
        document.getElementById('eventId').value = '';
        document.getElementById('eventForm').reset();
        
        // 设置默认状态为"计划中"
        document.getElementById('eventStatus').value = '计划中';
        
        // 加载场馆选项
        loadAdminVenueOptions('eventVenue');
        
        // 显示模态框
        new bootstrap.Modal(document.getElementById('eventModal')).show();
    });
    
    document.getElementById('saveEventBtn').addEventListener('click', saveEvent);
    
    // 用户管理过滤
    document.getElementById('visitorRoleFilter').addEventListener('change', function() {
        loadAdminVisitors(this.value);
    });
    
    // 预约管理过滤
    document.getElementById('reservationStatusFilter').addEventListener('change', function() {
        loadAdminReservations(this.value);
    });
}

// 显示登录错误
function showLoginError(message) {
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = message;
    errorEl.classList.remove('d-none');
}

// 显示注册错误
function showRegisterError(message) {
    const errorEl = document.getElementById('registerError');
    errorEl.textContent = message;
    errorEl.classList.remove('d-none');
}

// 初始化搜索功能
function initSearch() {
    const searchForm = document.getElementById('searchForm');
    
    searchForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const keyword = document.getElementById('searchInput').value.trim();
        if (!keyword) return;
        
        fetch(`${API_BASE_URL}/search?keyword=${encodeURIComponent(keyword)}`)
            .then(response => response.json())
            .then(results => {
                displaySearchResults(results);
            })
            .catch(error => {
                console.error('搜索错误:', error);
            });
    });
}

// 显示搜索结果
function displaySearchResults(results) {
    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = '';
    
    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="alert alert-info">没有找到相关结果</div>';
    } else {
        const venueResults = results.filter(r => r.type === 'venue');
        const eventResults = results.filter(r => r.type === 'event');
        
        if (venueResults.length > 0) {
            const venueSection = document.createElement('div');
            venueSection.innerHTML = `<h5 class="mt-3 mb-3">场馆 (${venueResults.length})</h5>`;
            
            const venueList = document.createElement('div');
            venueList.classList.add('list-group', 'mb-4');
            
            venueResults.forEach(venue => {
                const item = document.createElement('a');
                item.classList.add('list-group-item', 'list-group-item-action');
                item.href = '#';
                item.innerHTML = `
                    <div class="d-flex w-100 justify-content-between">
                        <h5 class="mb-1">${venue.name}</h5>
                        <span class="badge bg-primary">${venue.category}</span>
                    </div>
                    <p class="mb-1">${venue.address}</p>
                    <small class="text-muted">开放时间: ${venue.opening_hours}</small>
                `;
                
                item.addEventListener('click', function(e) {
                    e.preventDefault();
                    // 关闭搜索结果模态框
                    const searchResultModal = bootstrap.Modal.getInstance(document.getElementById('searchResultModal'));
                    searchResultModal.hide();
                    
                    // 切换到场馆页面并显示该场馆详情
                    document.querySelector('.navbar-nav .nav-link[data-section="venueMap"]').click();
                    showVenueDetail(venue.id);
                });
                
                venueList.appendChild(item);
            });
            
            venueSection.appendChild(venueList);
            resultsContainer.appendChild(venueSection);
        }
        
        if (eventResults.length > 0) {
            const eventSection = document.createElement('div');
            eventSection.innerHTML = `<h5 class="mt-3 mb-3">活动 (${eventResults.length})</h5>`;
            
            const eventList = document.createElement('div');
            eventList.classList.add('list-group');
            
            eventResults.forEach(event => {
                const startDate = new Date(event.start_date).toLocaleDateString();
                const endDate = new Date(event.end_date).toLocaleDateString();
                
                const item = document.createElement('a');
                item.classList.add('list-group-item', 'list-group-item-action');
                item.href = '#';
                item.innerHTML = `
                    <div class="d-flex w-100 justify-content-between">
                        <h5 class="mb-1">${event.name}</h5>
                        <span class="badge bg-success">${event.category}</span>
                    </div>
                    <p class="mb-1">${event.venue_name}</p>
                    <small class="text-muted">时间: ${startDate} 至 ${endDate}</small>
                `;
                
                item.addEventListener('click', function(e) {
                    e.preventDefault();
                    // 关闭搜索结果模态框
                    const searchResultModal = bootstrap.Modal.getInstance(document.getElementById('searchResultModal'));
                    searchResultModal.hide();
                    
                    // 切换到活动页面并显示该活动详情
                    document.querySelector('.navbar-nav .nav-link[data-section="events"]').click();
                    showEventDetail(event.id);
                });
                
                eventList.appendChild(item);
            });
            
            eventSection.appendChild(eventList);
            resultsContainer.appendChild(eventSection);
        }
    }
    
    // 显示搜索结果模态框
    const searchResultModal = new bootstrap.Modal(document.getElementById('searchResultModal'));
    searchResultModal.show();
}

// 全局函数，用于显示场馆详情（以便地图标记点击时调用）
window.showVenueDetail = function(venueId) {
    // 调用局部函数
    if (typeof venueId === 'number' || (typeof venueId === 'string' && !isNaN(parseInt(venueId)))) {
        fetch(`${API_BASE_URL}/venues/${venueId}`)
            .then(response => response.json())
            .then(data => {
                if (data.venue) {
                    // 创建模态框显示场馆详情
                    const modalHtml = `
                        <div class="modal fade" id="venueDetailModal" tabindex="-1">
                            <div class="modal-dialog modal-lg">
                                <div class="modal-content">
                                    <div class="modal-header">
                                        <h5 class="modal-title">${data.venue.name}</h5>
                                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                                    </div>
                                    <div class="modal-body">
                                        <div class="row">
                                            <div class="col-md-8">
                                                <p><strong>类型：</strong>${data.venue.type}</p>
                                                <p><strong>地址：</strong>${data.venue.address}</p>
                                                <p><strong>开放时间：</strong>${data.venue.opening_hours}</p>
                                                <p><strong>联系方式：</strong>${data.venue.contact_info || '暂无'}</p>
                                                <p><strong>门票信息：</strong>${data.venue.ticket_info || '暂无'}</p>
                                                <div class="mt-3">
                                                    <h6>场馆介绍</h6>
                                                    <p>${data.venue.introduction || '暂无介绍'}</p>
                                                </div>
                                            </div>
                                            <div class="col-md-4">
                                                <div class="card mb-3">
                                                    <div class="card-body">
                                                        <h6 class="card-title">访问统计</h6>
                                                        <p class="mb-1"><i class="fas fa-users me-2"></i>总访问量：${data.statistics?.total_visits || 0}</p>
                                                        <p class="mb-1"><i class="fas fa-user-check me-2"></i>独立访客：${data.statistics?.unique_visitors || 0}</p>
                                                        <p class="mb-0"><i class="fas fa-star me-2"></i>平均满意度：${data.statistics?.avg_satisfaction ? data.statistics.avg_satisfaction.toFixed(1) + '分' : '暂无评价'}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div class="mt-4">
                                            <h6>当前活动与展览</h6>
                                            ${renderEventsList(data.events)}
                                        </div>
                                    </div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                                        <button type="button" class="btn btn-primary venue-reserve-btn" data-venue-id="${data.venue.venue_id}">预约参观</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                    
                    // 移除已有的模态框
                    const existingModal = document.getElementById('venueDetailModal');
                    if (existingModal) {
                        existingModal.remove();
                    }
                    
                    // 添加到DOM并显示
                    document.body.insertAdjacentHTML('beforeend', modalHtml);
                    const modal = new bootstrap.Modal(document.getElementById('venueDetailModal'));
                    modal.show();
                    
                    // 添加预约按钮事件
                    document.querySelector('.venue-reserve-btn').addEventListener('click', function() {
                        const venueId = this.getAttribute('data-venue-id');
                        
                        // 关闭当前模态框
                        modal.hide();
                        
                        // 如果未登记访客信息，提示登记
                        if (!currentVisitorId) {
                            alert('请先登记访客信息，才能进行预约');
                            const visitorModal = new bootstrap.Modal(document.getElementById('visitorModal'));
                            visitorModal.show();
                            return;
                        }
                        
                        // 切换到预约标签
                        document.querySelector('.navbar-nav .nav-link[data-section="reservation"]').click();
                        
                        // 选择该场馆
                        const venueSelect = document.getElementById('reservationVenueSelect');
                        venueSelect.value = venueId;
                        venueSelect.dispatchEvent(new Event('change'));
                    });
                    
                    // 添加展览详情点击事件
                    document.querySelectorAll('.event-detail-link').forEach(link => {
                        link.addEventListener('click', function() {
                            const eventId = this.getAttribute('data-event-id');
                            
                            // 关闭当前模态框
                            modal.hide();
                            
                            showEventDetail(eventId);
                        });
                    });
                }
            })
            .catch(error => {
                console.error('获取场馆详情错误:', error);
            });
    } else {
        console.error('无效的场馆ID:', venueId);
    }
};

// 渲染活动列表HTML
function renderEventsList(events) {
    if (!events || events.length === 0) {
        return '<div class="alert alert-info">当前没有正在进行的活动或展览</div>';
    }
    
    let html = '<div class="list-group">';
    
    events.forEach(event => {
        const startDate = new Date(event.start_date).toLocaleDateString();
        const endDate = new Date(event.end_date).toLocaleDateString();
        
        html += `
            <a href="#" class="list-group-item list-group-item-action event-detail-link" data-event-id="${event.event_id}">
                <div class="d-flex w-100 justify-content-between">
                    <h6 class="mb-1">${event.name}</h6>
                    <span class="badge bg-success">${event.type}</span>
                </div>
                <p class="mb-1">${event.description ? event.description.substring(0, 100) + '...' : '暂无描述'}</p>
                <small class="text-muted">时间: ${startDate} 至 ${endDate}</small>
            </a>
        `;
    });
    
    html += '</div>';
    return html;
}

// 加载展览和活动数据
function loadEvents(filters = {}) {
    let url = `${API_BASE_URL}/events?upcoming=true`;
    
    if (filters.type) {
        url += `&type=${encodeURIComponent(filters.type)}`;
    }
    
    if (filters.venue_id) {
        url += `&venue_id=${filters.venue_id}`;
    }
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            events = data;
            displayEvents(events);
        })
        .catch(error => {
            console.error('加载活动数据错误:', error);
        });
}

// 显示展览和活动
function displayEvents(events) {
    const container = document.getElementById('eventsContainer');
    container.innerHTML = '';
    
    if (events.length === 0) {
        container.innerHTML = '<div class="col-12 text-center py-5"><p class="text-muted">没有找到符合条件的活动或展览</p></div>';
        return;
    }
    
    events.forEach(event => {
        const startDate = new Date(event.start_date).toLocaleDateString();
        const endDate = new Date(event.end_date).toLocaleDateString();
        
        const col = document.createElement('div');
        col.className = 'col-md-4 mb-4';
        
        col.innerHTML = `
            <div class="card h-100 shadow-sm">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="card-title">${event.name}</h5>
                        <span class="badge bg-success">${event.type}</span>
                    </div>
                    <h6 class="card-subtitle mb-2 text-muted">${event.venue_name}</h6>
                    <p class="card-text">${event.description ? event.description.substring(0, 120) + '...' : '暂无描述'}</p>
                </div>
                <div class="card-footer bg-white">
                    <div class="d-flex justify-content-between align-items-center">
                        <small class="text-muted">${startDate} 至 ${endDate}</small>
                        <button class="btn btn-sm btn-outline-primary event-detail-btn" data-event-id="${event.event_id}">
                            详情
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        container.appendChild(col);
    });
    
    // 添加详情按钮点击事件
    document.querySelectorAll('.event-detail-btn').forEach(button => {
        button.addEventListener('click', function() {
            const eventId = this.getAttribute('data-event-id');
            showEventDetail(eventId);
        });
    });
}

// 过滤活动
function filterEvents() {
    const typeFilter = document.getElementById('eventTypeFilter').value;
    const venueFilter = document.getElementById('venueFilter').value;
    
    const filters = {};
    if (typeFilter) filters.type = typeFilter;
    if (venueFilter) filters.venue_id = venueFilter;
    
    loadEvents(filters);
}

// 填充场馆过滤器选项
function populateVenueFilter(venues) {
    const venueFilters = document.querySelectorAll('#venueFilter, #reservationVenueSelect, select[name="venue_id"]');
    
    venueFilters.forEach(select => {
        const currentValue = select.value;
        
        // 保留第一个选项（默认选项）
        const defaultOption = select.options[0];
        select.innerHTML = '';
        select.appendChild(defaultOption);
        
        // 添加场馆选项
        venues.forEach(venue => {
            const option = document.createElement('option');
            option.value = venue.venue_id;
            option.textContent = venue.name;
            select.appendChild(option);
        });
        
        // 恢复选中值
        if (currentValue) {
            select.value = currentValue;
        }
    });
}

// 显示活动详情
function showEventDetail(eventId) {
    fetch(`${API_BASE_URL}/events/${eventId}`)
        .then(response => response.json())
        .then(data => {
            if (data.event) {
                const event = data.event;
                const startDate = new Date(event.start_date).toLocaleDateString();
                const endDate = new Date(event.end_date).toLocaleDateString();
                
                // 设置模态框内容
                document.getElementById('eventDetailTitle').textContent = event.name;
                
                const content = `
                    <div class="row">
                        <div class="col-md-8">
                            <p><strong>类型：</strong>${event.type}</p>
                            <p><strong>场馆：</strong>${event.venue_name}</p>
                            <p><strong>地址：</strong>${event.venue_address}</p>
                            <p><strong>时间：</strong>${startDate} 至 ${endDate}</p>
                            <p><strong>是否需要门票：</strong>${event.ticket_required ? '是' : '否'}</p>
                            <div class="mt-3">
                                <h6>活动介绍</h6>
                                <p>${event.description || '暂无介绍'}</p>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card mb-3">
                                <div class="card-body">
                                    <h6 class="card-title">预约统计</h6>
                                    <p class="mb-1">总预约数：${data.reservation_stats?.total_reservations || 0}</p>
                                    <p class="mb-1">已参加：${data.reservation_stats?.attended || 0}</p>
                                    <p class="mb-0">已取消：${data.reservation_stats?.cancelled || 0}</p>
                                </div>
                            </div>
                            <div class="card">
                                <div class="card-body">
                                    <h6 class="card-title">访客评价</h6>
                                    <p class="mb-0">
                                        <i class="fas fa-star text-warning me-1"></i>
                                        平均满意度：${data.satisfaction?.avg_satisfaction ? data.satisfaction.avg_satisfaction.toFixed(1) + '分' : '暂无评价'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                
                document.getElementById('eventDetailContent').innerHTML = content;
                
                // 设置预约按钮的活动ID
                document.getElementById('reserveEventBtn').setAttribute('data-event-id', event.event_id);
                
                // 显示模态框
                const modal = new bootstrap.Modal(document.getElementById('eventDetailModal'));
                modal.show();
            }
        })
        .catch(error => {
            console.error('获取活动详情错误:', error);
        });
}

// 提交活动预约
function submitReservation(eventId) {
    fetch(`${API_BASE_URL}/reservations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
            event_id: eventId
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('预约失败：' + data.error);
            return;
        }
        
        // 关闭活动详情模态框（如果打开的话）
        const eventDetailModal = bootstrap.Modal.getInstance(document.getElementById('eventDetailModal'));
        if (eventDetailModal) {
            eventDetailModal.hide();
        }
        
        alert('预约成功！');
        
        // 刷新我的预约列表
        loadMyReservations();
    })
    .catch(error => {
        console.error('预约请求失败:', error);
        alert('预约失败，请稍后重试');
    });
}

// 加载场馆活动选项
function loadVenueEvents(venueId, selectId) {
    fetch(`${API_BASE_URL}/events?venue_id=${venueId}&upcoming=true`)
        .then(response => response.json())
        .then(events => {
            const select = document.getElementById(selectId);
            
            // 清空现有选项，保留第一个默认选项
            const defaultOption = select.options[0];
            select.innerHTML = '';
            select.appendChild(defaultOption);
            
            if (events.length === 0) {
                defaultOption.textContent = '没有可预约的活动';
                return;
            }
            
            defaultOption.textContent = '请选择活动...';
            
            // 添加活动选项
            events.forEach(event => {
                const option = document.createElement('option');
                option.value = event.event_id;
                option.textContent = event.name;
                select.appendChild(option);
            });
        })
        .catch(error => {
            console.error('加载场馆活动错误:', error);
        });
}

// 显示活动预览
function showEventPreview(eventId) {
    fetch(`${API_BASE_URL}/events/${eventId}`)
        .then(response => response.json())
        .then(data => {
            if (data.event) {
                const event = data.event;
                const startDate = new Date(event.start_date).toLocaleDateString();
                const endDate = new Date(event.end_date).toLocaleDateString();
                
                document.getElementById('previewEventName').textContent = event.name;
                document.getElementById('previewEventDetails').innerHTML = `
                    <strong>类型：</strong>${event.type}<br>
                    <strong>场馆：</strong>${event.venue_name}<br>
                    <strong>时间：</strong>${startDate} 至 ${endDate}<br>
                    <strong>介绍：</strong>${event.description || '暂无介绍'}
                `;
                
                document.getElementById('eventPreviewPanel').classList.remove('d-none');
            }
        })
        .catch(error => {
            console.error('获取活动详情错误:', error);
        });
}

// 隐藏活动预览
function hideEventPreview() {
    document.getElementById('eventPreviewPanel').classList.add('d-none');
}

// 加载我的预约数据
function loadMyReservations() {
    if (!authToken) return;
    
    const tableBody = document.getElementById('myReservationsTable');
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center">加载中...</td></tr>';
    
    fetch(`${API_BASE_URL}/visitor/reservations`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('获取预约失败');
        }
        return response.json();
    })
    .then(reservations => {
        if (!reservations || reservations.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">暂无预约记录</td></tr>';
            return;
        }
        
        tableBody.innerHTML = '';
        reservations.forEach(reservation => {
            const row = document.createElement('tr');
            
            // 格式化日期
            const startDate = new Date(reservation.start_date);
            const endDate = new Date(reservation.end_date);
            const dateStr = `${startDate.toLocaleDateString()} 至 ${endDate.toLocaleDateString()}`;
            
            row.innerHTML = `
                <td>${reservation.reservation_id}</td>
                <td>${reservation.event_name}</td>
                <td>${reservation.venue_name}</td>
                <td>${dateStr}</td>
                <td><span class="badge ${getStatusBadgeClass(reservation.status)}">${reservation.status}</span></td>
                <td>
                    ${reservation.status === '待审批' || reservation.status === '已批准' ? 
                    `<button class="btn btn-sm btn-danger cancel-btn" data-reservation-id="${reservation.reservation_id}">取消</button>` : 
                    ''}
                </td>
            `;
            tableBody.appendChild(row);
        });
        
        // 添加取消按钮事件
        document.querySelectorAll('.cancel-btn').forEach(button => {
            button.addEventListener('click', function() {
                const reservationId = this.getAttribute('data-reservation-id');
                cancelReservation(reservationId);
            });
        });
    })
    .catch(error => {
        console.error('获取预约数据失败:', error);
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">获取预约失败: ${error.message}</td></tr>`;
    });
}

// 获取预约状态对应的样式类
function getStatusBadgeClass(status) {
    switch(status) {
        case '待审批': return 'bg-warning';
        case '已批准': return 'bg-primary';
        case '已参加': return 'bg-success';
        case '已取消': return 'bg-secondary';
        case '已拒绝': return 'bg-danger';
        default: return 'bg-secondary';
    }
}

// 取消预约
function cancelReservation(reservationId) {
    if (!confirm('确定要取消这个预约吗？')) {
        return;
    }
    
    fetch(`${API_BASE_URL}/reservations/${reservationId}/cancel`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('取消失败：' + data.error);
            return;
        }
        
        alert('预约已成功取消');
        loadMyReservations();
    })
    .catch(error => {
        console.error('取消预约请求失败:', error);
        alert('取消失败，请稍后重试');
    });
}

// 加载分析数据
function loadAnalyticsData() {
    loadVisitorTrends();
    loadVenueTypeDistribution();
    loadVisitorAgeDistribution();
    loadOccupationPreference();
    loadEventPopularity();
    loadTimeDistribution();
    loadTopEvents();
}

// 加载分析数据中的图表功能实现
function loadVisitorTrends(period = 'monthly') {
    fetch(`${API_BASE_URL}/analytics/visitor_trends?period=${period}`)
        .then(response => response.json())
        .then(data => {
            const trendChart = echarts.init(document.getElementById('visitorTrendsChart'));
            
            // 处理数据
            const timeLabels = data.map(item => item.time_period);
            const visitorCounts = data.map(item => item.visitor_count);
            
            // 配置图表
            const option = {
                tooltip: {
                    trigger: 'axis',
                    formatter: '{b}: {c} 人次'
                },
                xAxis: {
                    type: 'category',
                    data: timeLabels,
                    axisLabel: {
                        rotate: period === 'daily' ? 45 : 0
                    }
                },
                yAxis: {
                    type: 'value',
                    name: '访客数'
                },
                series: [{
                    name: '访客数',
                    type: 'line',
                    data: visitorCounts,
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 6,
                    lineStyle: {
                        width: 3,
                        color: '#3498db'
                    },
                    itemStyle: {
                        color: '#3498db'
                    },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(52, 152, 219, 0.5)' },
                            { offset: 1, color: 'rgba(52, 152, 219, 0.1)' }
                        ])
                    }
                }]
            };
            
            trendChart.setOption(option);
            
            // 窗口大小变化时重新调整图表大小
            window.addEventListener('resize', () => {
                trendChart.resize();
            });
        })
        .catch(error => {
            console.error('加载访客趋势数据错误:', error);
        });
}

// 加载场馆类型分布
function loadVenueTypeDistribution() {
    fetch(`${API_BASE_URL}/analytics/visitor_profiles?dimension=venue_type`)
        .then(response => response.json())
        .then(data => {
            const pieChart = echarts.init(document.getElementById('venueTypePieChart'));
            
            // 处理数据
            const pieData = data.map(item => ({
                name: item.type || '未知类型',
                value: item.total_visits
            }));
            
            // 配置图表
            const option = {
                tooltip: {
                    trigger: 'item',
                    formatter: '{b}: {c} 人次 ({d}%)'
                },
                legend: {
                    orient: 'horizontal',
                    bottom: 10,
                    data: pieData.map(item => item.name)
                },
                series: [{
                    name: '场馆类型',
                    type: 'pie',
                    radius: '65%',
                    center: ['50%', '45%'],
                    data: pieData,
                    itemStyle: {
                        borderRadius: 5,
                        borderColor: '#fff',
                        borderWidth: 2
                    },
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 10,
                            shadowOffsetX: 0,
                            shadowColor: 'rgba(0, 0, 0, 0.5)'
                        }
                    },
                    label: {
                        formatter: '{b}: {d}%'
                    }
                }]
            };
            
            pieChart.setOption(option);
            
            // 窗口大小变化时重新调整图表大小
            window.addEventListener('resize', () => {
                pieChart.resize();
            });
        })
        .catch(error => {
            console.error('加载场馆类型分布数据错误:', error);
        });
}

// 加载访客年龄分布
function loadVisitorAgeDistribution() {
    fetch(`${API_BASE_URL}/analytics/visitor_profiles?dimension=age_group`)
        .then(response => response.json())
        .then(data => {
            const ageChart = echarts.init(document.getElementById('visitorAgeChart'));
            
            // 处理数据
            const ageGroups = data.map(item => item.age_group);
            const visitCounts = data.map(item => item.total_visits);
            
            // 配置图表
            const option = {
                tooltip: {
                    trigger: 'axis',
                    formatter: '{b}: {c} 人次'
                },
                xAxis: {
                    type: 'category',
                    data: ageGroups
                },
                yAxis: {
                    type: 'value',
                    name: '访问人次'
                },
                series: [{
                    name: '访问人次',
                    type: 'bar',
                    data: visitCounts,
                    barWidth: '40%',
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#83bff6' },
                            { offset: 0.5, color: '#188df0' },
                            { offset: 1, color: '#188df0' }
                        ])
                    }
                }]
            };
            
            ageChart.setOption(option);
            
            // 窗口大小变化时重新调整图表大小
            window.addEventListener('resize', () => {
                ageChart.resize();
            });
        })
        .catch(error => {
            console.error('加载访客年龄分布数据错误:', error);
        });
}

// 加载不同职业的场馆偏好
function loadOccupationPreference() {
    fetch(`${API_BASE_URL}/analytics/visitor_profiles?dimension=occupation_venue_type`)
        .then(response => response.json())
        .then(data => {
            const occupationChart = echarts.init(document.getElementById('occupationPreferenceChart'));
            
            // 处理数据
            const occupationData = data || [];
            
            // 提取所有不同的职业类型和场馆类型
            const occupations = [...new Set(occupationData.map(item => item.occupation_type))].slice(0, 6); // 取前6个职业
            const venueTypes = [...new Set(occupationData.map(item => item.venue_type))];
            
            const seriesData = venueTypes.map(venueType => {
                return {
                    name: venueType,
                    type: 'bar',
                    stack: 'total',
                    label: {
                        show: false
                    },
                    emphasis: {
                        focus: 'series'
                    },
                    data: occupations.map(occupation => {
                        const match = occupationData.find(item => 
                            item.occupation_type === occupation && 
                            item.venue_type === venueType
                        );
                        return match ? match.total_visits : 0;
                    })
                };
            });
            
            // 配置图表
            const option = {
                tooltip: {
                    trigger: 'axis',
                    axisPointer: {
                        type: 'shadow'
                    }
                },
                legend: {
                    data: venueTypes
                },
                grid: {
                    left: '3%',
                    right: '4%',
                    bottom: '3%',
                    containLabel: true
                },
                xAxis: {
                    type: 'category',
                    data: occupations
                },
                yAxis: {
                    type: 'value',
                    name: '访问人次'
                },
                series: seriesData
            };
            
            occupationChart.setOption(option);
            
            // 窗口大小变化时重新调整图表大小
            window.addEventListener('resize', () => {
                occupationChart.resize();
            });
        })
        .catch(error => {
            console.error('加载职业场馆偏好数据错误:', error);
        });
}

// 加载活动类型受欢迎程度
function loadEventPopularity() {
    console.log('开始加载活动类型受欢迎程度数据...');
    fetch(`${API_BASE_URL}/analytics/event_popularity`)
        .then(response => {
            console.log('API响应状态:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('收到活动受欢迎程度数据:', data);
            
            // 确保data是数组
            if (!data || typeof data !== 'object') {
                console.warn('无效的活动类型受欢迎程度数据');
                return;
            }
            
            // 如果返回的是对象而不是数组（例如错误消息），处理这种情况
            const dataArray = Array.isArray(data) ? data : [];
            
            // 确保data不是空数组
            if (dataArray.length === 0) {
                console.warn('没有获取到活动类型受欢迎程度数据');
                return;
            }
            
            const popularityChart = echarts.init(document.getElementById('eventPopularityChart'));
            
            // 处理数据
            const eventTypes = dataArray.map(item => item.event_type || '未知类型');
            const visitorCounts = dataArray.map(item => parseInt(item.unique_visitors) || 0);
            const satisfactions = dataArray.map(item => {
                if (item.avg_satisfaction) {
                    return parseFloat(item.avg_satisfaction).toFixed(1);
                }
                return 0;
            });
            
            // 配置图表
            const option = {
                tooltip: {
                    trigger: 'axis',
                    axisPointer: {
                        type: 'cross',
                        crossStyle: {
                            color: '#999'
                        }
                    }
                },
                legend: {
                    data: ['访客数', '满意度']
                },
                xAxis: {
                    type: 'category',
                    data: eventTypes,
                    axisPointer: {
                        type: 'shadow'
                    }
                },
                yAxis: [
                    {
                        type: 'value',
                        name: '访客数',
                        min: 0,
                        interval: 50,
                        position: 'left'
                    },
                    {
                        type: 'value',
                        name: '满意度',
                        min: 0,
                        max: 5,
                        interval: 1,
                        position: 'right',
                        axisLabel: {
                            formatter: '{value} 分'
                        }
                    }
                ],
                series: [
                    {
                        name: '访客数',
                        type: 'bar',
                        barWidth: '40%',
                        data: visitorCounts,
                        itemStyle: {
                            color: '#3498db'
                        }
                    },
                    {
                        name: '满意度',
                        type: 'line',
                        yAxisIndex: 1,
                        data: satisfactions,
                        symbol: 'circle',
                        symbolSize: 8,
                        itemStyle: {
                            color: '#e74c3c'
                        },
                        lineStyle: {
                            width: 3
                        }
                    }
                ]
            };
            
            popularityChart.setOption(option);
            console.log('活动类型受欢迎程度图表已渲染');
            
            // 窗口大小变化时重新调整图表大小
            window.addEventListener('resize', () => {
                popularityChart.resize();
            });
        })
        .catch(error => {
            console.error('加载活动类型受欢迎程度数据错误:', error);
        });
}

// 加载访问时间分布
function loadTimeDistribution(type = 'hourly') {
    fetch(`${API_BASE_URL}/analytics/visit_time_distribution?type=${type}`)
        .then(response => response.json())
        .then(data => {
            const distributionChart = echarts.init(document.getElementById('timeDistributionChart'));
            
            // 处理数据
            let labels, values;
            
            if (type === 'hourly') {
                labels = data.map(item => `${item.hour}:00`);
                values = data.map(item => item.visit_count);
            } else { // weekly
                labels = data.map(item => item.day_name);
                values = data.map(item => item.visit_count);
            }
            
            // 配置图表
            const option = {
                tooltip: {
                    trigger: 'axis',
                    formatter: '{b}: {c} 人次'
                },
                xAxis: {
                    type: 'category',
                    data: labels
                },
                yAxis: {
                    type: 'value',
                    name: '访问人次'
                },
                series: [{
                    name: '访问人次',
                    type: type === 'hourly' ? 'line' : 'bar',
                    data: values,
                    smooth: type === 'hourly',
                    symbol: type === 'hourly' ? 'circle' : 'none',
                    symbolSize: 6,
                    lineStyle: {
                        width: type === 'hourly' ? 3 : 0,
                        color: '#9b59b6'
                    },
                    itemStyle: {
                        color: '#9b59b6'
                    },
                    areaStyle: type === 'hourly' ? {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(155, 89, 182, 0.5)' },
                            { offset: 1, color: 'rgba(155, 89, 182, 0.1)' }
                        ])
                    } : undefined
                }]
            };
            
            distributionChart.setOption(option);
            
            // 窗口大小变化时重新调整图表大小
            window.addEventListener('resize', () => {
                distributionChart.resize();
            });
        })
        .catch(error => {
            console.error('加载访问时间分布数据错误:', error);
        });
}

// 加载TOP10活动
function loadTopEvents() {
    console.log('开始加载TOP10活动数据...');
    fetch(`${API_BASE_URL}/analytics/top_events`)
        .then(response => {
            console.log('API响应状态:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('收到TOP10活动数据:', data);
            
            const tableBody = document.getElementById('topEventsTable');
            tableBody.innerHTML = '';
            
            // 确保data是数组
            if (!data || typeof data !== 'object') {
                tableBody.innerHTML = '<tr><td colspan="6" class="text-center">数据格式错误</td></tr>';
                return;
            }
            
            // 如果返回的是对象而不是数组（例如错误消息），处理这种情况
            const dataArray = Array.isArray(data) ? data : [];
            
            // 检查是否有数据
            if (dataArray.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" class="text-center">暂无数据</td></tr>';
                return;
            }
            
            dataArray.forEach((event, index) => {
                const row = document.createElement('tr');
                
                // 确保所有必要的字段都有值，避免undefined
                const eventName = event.event_name || '未命名活动';
                const venueName = event.venue_name || '未知场馆';
                const eventType = event.event_type || '未知类型';
                const visitorCount = event.visitor_count || 0;
                
                let ratingHTML = '暂无评价';
                if (event.avg_satisfaction) {
                    const rating = parseFloat(event.avg_satisfaction).toFixed(1);
                    ratingHTML = `
                        <span class="star-rating">
                            ${getStarRating(rating)}
                        </span>
                        <span class="ms-2">${rating}分</span>
                    `;
                }
                
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${eventName}</td>
                    <td>${venueName}</td>
                    <td>${eventType}</td>
                    <td>${visitorCount}</td>
                    <td>${ratingHTML}</td>
                `;
                
                tableBody.appendChild(row);
            });
            
            console.log('TOP10活动表格已渲染');
        })
        .catch(error => {
            console.error('加载TOP10活动数据错误:', error);
            // 显示错误信息在表格中
            const tableBody = document.getElementById('topEventsTable');
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">加载数据时出错: ${error.message}</td></tr>`;
        });
}

// 生成星级评分显示
function getStarRating(rating) {
    rating = parseFloat(rating);
    let stars = '';
    
    for (let i = 1; i <= 5; i++) {
        if (i <= Math.floor(rating)) {
            stars += '<i class="fas fa-star"></i>';
        } else if (i - 0.5 <= rating) {
            stars += '<i class="fas fa-star-half-alt"></i>';
        } else {
            stars += '<i class="far fa-star"></i>';
        }
    }
    
    return stars;
}

// 加载访客反馈数据
function loadFeedbackData() {
    loadVenueSatisfaction();
    loadRecentFeedbacks();
    loadFeedbackWordCloud();
}

// 加载场馆满意度排名
function loadVenueSatisfaction() {
    fetch(`${API_BASE_URL}/venues`)
        .then(response => response.json())
        .then(venuesData => {
            const promises = venuesData.map(venue => 
                fetch(`${API_BASE_URL}/venues/${venue.venue_id}`)
                    .then(response => response.json())
            );
            
            Promise.all(promises)
                .then(results => {
                    // 筛选有评价的场馆，并按满意度排序
                    const venueSatisfaction = results
                        .filter(result => result.statistics && result.statistics.avg_satisfaction)
                        .sort((a, b) => b.statistics.avg_satisfaction - a.statistics.avg_satisfaction)
                        .slice(0, 10); // 取前10名
                    
                    if (venueSatisfaction.length > 0) {
                        const satisfactionChart = echarts.init(document.getElementById('venueSatisfactionChart'));
                        
                        // 处理数据
                        const venueNames = venueSatisfaction.map(item => item.venue.name);
                        const satisfactionScores = venueSatisfaction.map(item => item.statistics.avg_satisfaction);
                        
                        // 配置图表
                        const option = {
                            tooltip: {
                                trigger: 'axis',
                                formatter: '{b}: {c} 分'
                            },
                            grid: {
                                left: '3%',
                                right: '4%',
                                bottom: '15%',
                                containLabel: true
                            },
                            xAxis: {
                                type: 'category',
                                data: venueNames,
                                axisLabel: {
                                    interval: 0,
                                    rotate: 45
                                }
                            },
                            yAxis: {
                                type: 'value',
                                name: '满意度',
                                min: 0,
                                max: 5,
                                interval: 1
                            },
                            series: [{
                                name: '满意度',
                                type: 'bar',
                                data: satisfactionScores,
                                barWidth: '40%',
                                itemStyle: {
                                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                        { offset: 0, color: '#2ecc71' },
                                        { offset: 1, color: '#27ae60' }
                                    ])
                                },
                                label: {
                                    show: true,
                                    position: 'top',
                                    formatter: '{c} 分'
                                }
                            }]
                        };
                        
                        satisfactionChart.setOption(option);
                        
                        // 窗口大小变化时重新调整图表大小
                        window.addEventListener('resize', () => {
                            satisfactionChart.resize();
                        });
                    }
                });
        })
        .catch(error => {
            console.error('加载场馆满意度数据错误:', error);
        });
}

// 加载最新访客反馈
function loadRecentFeedbacks() {
    fetch(`${API_BASE_URL}/venues`)
        .then(response => response.json())
        .then(venuesData => {
            // 创建查询所有场馆访问记录的请求
            const promises = venuesData.map(venue => 
                fetch(`${API_BASE_URL}/venues/${venue.venue_id}`)
                    .then(response => response.json())
            );
            
            Promise.all(promises)
                .then(results => {
                    // 这里在实际应用中应该有专门的API获取最新反馈
                    // 为了模拟，我们随机生成一些反馈
                    const feedbacks = [
                        { venue: '武汉博物馆', rating: 5, text: '展品丰富，工作人员服务态度很好，环境整洁，值得推荐！', time: '2023-05-15' },
                        { venue: '湖北省图书馆', rating: 4, text: '阅读环境安静舒适，书籍种类多，但自习区座位偏少。', time: '2023-05-14' },
                        { venue: '武汉美术馆', rating: 5, text: '最近的现代艺术展非常震撼，展览空间利用得很好。', time: '2023-05-13' },
                        { venue: '楚河汉街文化中心', rating: 3, text: '活动内容有趣但组织有些混乱，建议改进引导标识。', time: '2023-05-12' },
                        { venue: '江夏区图书馆', rating: 4, text: '新馆舍设计很现代，电子资源丰富，但部分区域照明不足。', time: '2023-05-11' }
                    ];
                    
                    const container = document.getElementById('recentFeedbacks');
                    container.innerHTML = '';
                    
                    feedbacks.forEach(feedback => {
                        const feedbackCard = document.createElement('div');
                        let cardClass = 'feedback-card';
                        
                        if (feedback.rating >= 4) {
                            cardClass += ' positive';
                        } else if (feedback.rating <= 2) {
                            cardClass += ' negative';
                        } else {
                            cardClass += ' neutral';
                        }
                        
                        feedbackCard.className = cardClass;
                        feedbackCard.innerHTML = `
                            <div class="d-flex justify-content-between">
                                <h6>${feedback.venue}</h6>
                                <span class="text-muted small">${feedback.time}</span>
                            </div>
                            <div class="mb-2 star-rating">
                                ${getStarRating(feedback.rating)}
                            </div>
                            <p class="mb-0">${feedback.text}</p>
                        `;
                        
                        container.appendChild(feedbackCard);
                    });
                });
        })
        .catch(error => {
            console.error('加载访客反馈数据错误:', error);
        });
}

// 加载访客反馈词云
function loadFeedbackWordCloud() {
    // 在实际应用中，这里应该有API获取词云数据
    // 为了模拟，我们使用一些常见的反馈词汇
    const wordCloudData = [
        { name: '干净整洁', value: 95 },
        { name: '服务周到', value: 88 },
        { name: '展品丰富', value: 80 },
        { name: '环境舒适', value: 78 },
        { name: '交通便利', value: 72 },
        { name: '知识丰富', value: 68 },
        { name: '活动有趣', value: 65 },
        { name: '讲解精彩', value: 62 },
        { name: '座位不足', value: 58 },
        { name: '排队时间长', value: 52 },
        { name: '标识不清', value: 48 },
        { name: '照明不足', value: 45 },
        { name: '卫生间少', value: 42 },
        { name: '声音嘈杂', value: 38 },
        { name: '展品介绍不详', value: 35 },
        { name: '文化气息浓厚', value: 85 },
        { name: '值得推荐', value: 90 },
        { name: '讲解生动', value: 75 },
        { name: '互动性强', value: 70 },
        { name: '设计新颖', value: 65 }
    ];
    
    const wordCloudChart = echarts.init(document.getElementById('feedbackWordCloudChart'));
    
    const option = {
        tooltip: {
            show: true
        },
        series: [{
            type: 'wordCloud',
            shape: 'circle',
            left: 'center',
            top: 'center',
            width: '90%',
            height: '90%',
            right: null,
            bottom: null,
            sizeRange: [14, 50],
            rotationRange: [-45, 45],
            rotationStep: 15,
            gridSize: 8,
            drawOutOfBound: false,
            textStyle: {
                fontFamily: 'sans-serif',
                fontWeight: 'bold',
                color: function () {
                    return 'rgb(' + [
                        Math.round(Math.random() * 160),
                        Math.round(Math.random() * 160),
                        Math.round(Math.random() * 160)
                    ].join(',') + ')';
                }
            },
            emphasis: {
                textStyle: {
                    shadowBlur: 10,
                    shadowColor: '#333'
                }
            },
            data: wordCloudData
        }]
    };
    
    wordCloudChart.setOption(option);
    
    // 窗口大小变化时重新调整图表大小
    window.addEventListener('resize', () => {
        wordCloudChart.resize();
    });
}

// 加载场馆选项（用于预约和访问记录）
function loadVenueOptions() {
    fetch(`${API_BASE_URL}/venues`)
        .then(response => response.json())
        .then(data => {
            const venueSelects = document.querySelectorAll('#reservationVenueSelect, select[name="venue_id"]');
            
            venueSelects.forEach(select => {
                // 保留第一个选项（默认选项）
                const defaultOption = select.options[0];
                select.innerHTML = '';
                select.appendChild(defaultOption);
                
                // 添加场馆选项
                data.forEach(venue => {
                    const option = document.createElement('option');
                    option.value = venue.venue_id;
                    option.textContent = venue.name;
                    select.appendChild(option);
                });
            });
            
            // 当场馆选择变化时，加载相应的活动
            document.querySelector('select[name="venue_id"]').addEventListener('change', function() {
                const venueId = this.value;
                if (venueId) {
                    loadVenueEvents(venueId, 'event_id');
                } else {
                    const eventSelect = document.querySelector('select[name="event_id"]');
                    eventSelect.innerHTML = '<option value="">无/不参加特定活动</option>';
                }
            });
        })
        .catch(error => {
            console.error('加载场馆选项错误:', error);
        });
}

// 加载访客访问记录
function loadVisitorVisits() {
    if (!authToken) return;
    
    fetch(`${API_BASE_URL}/visitor/visits`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('获取访问记录失败');
        }
        return response.json();
    })
    .then(visits => {
        // TODO: 显示访问记录
        console.log('加载到访问记录:', visits);
    })
    .catch(error => {
        console.error('获取访问记录失败:', error);
    });
}

// 加载管理员数据
function loadAdminData() {
    if (!authToken || !currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'venue_manager')) {
        alert('您没有管理员权限');
        return;
    }
    
    // 显示管理后台部分
    const contentSections = document.querySelectorAll('.content-section');
    contentSections.forEach(section => section.classList.add('d-none'));
    document.getElementById('adminPanel').classList.remove('d-none');
    
    // 加载各类管理数据
    loadAdminReservations();
    loadAdminEvents();
    loadAdminVisitors();
    
    // 更新导航高亮
    updateActiveNav('adminPanel');
}

// 加载管理员场馆选项
function loadAdminVenueOptions(selectId) {
    const selectElement = document.getElementById(selectId);
    if (!selectElement) return;
    
    // 清空当前选项
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }
    
    // 如果是场馆管理员，只显示自己管理的场馆
    if (currentUser && currentUser.role === 'venue_manager' && currentUser.managed_venue_id) {
        const managedVenue = venues.find(v => v.venue_id === currentUser.managed_venue_id);
        if (managedVenue) {
            const option = document.createElement('option');
            option.value = managedVenue.venue_id;
            option.textContent = managedVenue.name;
            selectElement.appendChild(option);
        }
        selectElement.value = currentUser.managed_venue_id;
        selectElement.disabled = true;  // 场馆管理员不能选择其他场馆
        return;
    }
    
    // 系统管理员可以选择所有场馆
    venues.forEach(venue => {
        const option = document.createElement('option');
        option.value = venue.venue_id;
        option.textContent = venue.name;
        selectElement.appendChild(option);
    });
}

// 保存活动（创建或更新）
function saveEvent() {
    if (!authToken) return;
    
    // 获取表单数据
    const eventId = document.getElementById('eventId').value;
    const formData = {
        name: document.getElementById('eventName').value,
        type: document.getElementById('eventType').value,
        venue_id: document.getElementById('eventVenue').value,
        start_date: document.getElementById('eventStartDate').value,
        end_date: document.getElementById('eventEndDate').value,
        capacity: document.getElementById('eventCapacity').value || null,
        ticket_required: document.getElementById('eventTicketRequired').checked,
        status: document.getElementById('eventStatus').value,
        description: document.getElementById('eventDescription').value
    };
    
    // 表单验证
    if (!formData.name || !formData.type || !formData.venue_id || !formData.start_date || !formData.end_date) {
        document.getElementById('eventFormError').textContent = '请填写所有必填字段';
        document.getElementById('eventFormError').classList.remove('d-none');
        return;
    }
    
    // 确定是创建还是更新
    const isUpdate = eventId ? true : false;
    const url = isUpdate ? 
        `${API_BASE_URL}/admin/events/${eventId}` : 
        `${API_BASE_URL}/admin/events`;
    const method = isUpdate ? 'PUT' : 'POST';
    
    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(formData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || '保存活动失败');
            });
        }
        return response.json();
    })
    .then(data => {
        // 关闭模态框
        const modal = bootstrap.Modal.getInstance(document.getElementById('eventModal'));
        if (modal) {
            modal.hide();
        }
        
        // 重新加载活动列表
        loadAdminEvents();
        
        // 显示成功提示
        alert(isUpdate ? '活动更新成功' : '活动创建成功');
    })
    .catch(error => {
        document.getElementById('eventFormError').textContent = error.message;
        document.getElementById('eventFormError').classList.remove('d-none');
    });
}

// 加载管理员活动列表
function loadAdminEvents() {
    if (!authToken) return;
    
    const tableBody = document.getElementById('adminEventsTable');
    if (!tableBody) return;
    
    tableBody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center">
                <div class="spinner-border spinner-border-sm text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <span class="ms-2">加载中...</span>
            </td>
        </tr>
    `;
    
    fetch(`${API_BASE_URL}/admin/events`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('加载活动失败');
        }
        return response.json();
    })
    .then(events => {
        if (events.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">暂无活动数据</td></tr>';
            return;
        }
        
        tableBody.innerHTML = '';
        events.forEach(event => {
            const row = document.createElement('tr');
            
            // 格式化日期
            const startDate = new Date(event.start_date).toLocaleDateString('zh-CN');
            const endDate = new Date(event.end_date).toLocaleDateString('zh-CN');
            
            row.innerHTML = `
                <td>${event.event_id}</td>
                <td>${event.name}</td>
                <td>${event.venue_name}</td>
                <td>${startDate} 至 ${endDate}</td>
                <td><span class="badge ${getEventStatusBadgeClass(event.status)}">${event.status}</span></td>
                <td>${event.reservation_count || 0}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary edit-event-btn" data-id="${event.event_id}">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            `;
            
            tableBody.appendChild(row);
            
            // 添加编辑按钮事件
            row.querySelector('.edit-event-btn').addEventListener('click', function() {
                openEventEditModal(event.event_id);
            });
        });
    })
    .catch(error => {
        console.error('加载活动列表错误:', error);
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">加载失败: ${error.message}</td></tr>`;
    });
}

// 打开活动编辑模态框
function openEventEditModal(eventId) {
    if (!authToken) return;
    
    // 显示加载中状态
    document.getElementById('eventForm').reset();
    document.getElementById('eventModalTitle').textContent = '编辑活动';
    document.getElementById('eventFormError').classList.add('d-none');
    
    // 显示模态框
    const modal = new bootstrap.Modal(document.getElementById('eventModal'));
    modal.show();
    
    // 加载场馆选项
    loadAdminVenueOptions('eventVenue');
    
    // 获取活动详情
    fetch(`${API_BASE_URL}/events/${eventId}`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('获取活动详情失败');
        }
        return response.json();
    })
    .then(data => {
        const event = data.event;
        
        // 填充表单
        document.getElementById('eventId').value = event.event_id;
        document.getElementById('eventName').value = event.name;
        document.getElementById('eventType').value = event.type;
        document.getElementById('eventVenue').value = event.venue_id;
        document.getElementById('eventStartDate').value = event.start_date.substr(0, 10);
        document.getElementById('eventEndDate').value = event.end_date.substr(0, 10);
        document.getElementById('eventCapacity').value = event.capacity || '';
        document.getElementById('eventTicketRequired').checked = event.ticket_required;
        document.getElementById('eventStatus').value = event.status;
        document.getElementById('eventDescription').value = event.description || '';
    })
    .catch(error => {
        console.error('获取活动详情错误:', error);
        document.getElementById('eventFormError').textContent = error.message;
        document.getElementById('eventFormError').classList.remove('d-none');
    });
}

// 加载管理员预约列表
function loadAdminReservations(statusFilter = '') {
    if (!authToken) return;
    
    const tableBody = document.getElementById('adminReservationsTable');
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center">加载中...</td></tr>';
    
    let url = `${API_BASE_URL}/admin/reservations`;
    
    fetch(url, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('获取预约列表失败');
        }
        return response.json();
    })
    .then(reservations => {
        if (reservations.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">暂无预约数据</td></tr>';
            return;
        }
        
        tableBody.innerHTML = '';
        reservations.forEach(reservation => {
            // 过滤状态（如果有指定过滤条件）
            if (statusFilter && reservation.status !== statusFilter) {
                return;
            }
            
            const row = document.createElement('tr');
            
            // 格式化日期
            const reservationDate = new Date(reservation.reservation_date).toLocaleString('zh-CN');
            
            row.innerHTML = `
                <td>${reservation.reservation_id}</td>
                <td>${reservation.event_name}</td>
                <td>${reservationDate}</td>
                <td>${reservation.visitor_username}</td>
                <td><span class="badge ${getStatusBadgeClass(reservation.status)}">${reservation.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-info view-reservation-btn" data-reservation-id="${reservation.reservation_id}">查看详情</button>
                </td>
            `;
            
            tableBody.appendChild(row);
            
            // 添加查看详情按钮事件
            row.querySelector('.view-reservation-btn').addEventListener('click', function() {
                showReservationDetail(reservation);
            });
        });
    })
    .catch(error => {
        console.error('加载预约列表错误:', error);
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">加载失败: ${error.message}</td></tr>`;
    });
}

// 显示预约详情
function showReservationDetail(reservation) {
    const detailContent = document.getElementById('reservationDetailContent');
    
    // 格式化日期
    const reservationDate = new Date(reservation.reservation_date).toLocaleString('zh-CN');
    const eventStartDate = new Date(reservation.start_date).toLocaleDateString('zh-CN');
    const eventEndDate = new Date(reservation.end_date).toLocaleDateString('zh-CN');
    
    detailContent.innerHTML = `
        <div class="mb-3">
            <h6>预约信息</h6>
            <p>
                <strong>预约ID:</strong> ${reservation.reservation_id}<br>
                <strong>预约时间:</strong> ${reservationDate}<br>
                <strong>状态:</strong> <span class="badge ${getStatusBadgeClass(reservation.status)}">${reservation.status}</span><br>
                ${reservation.notes ? `<strong>备注:</strong> ${reservation.notes}<br>` : ''}
            </p>
        </div>
        
        <div class="mb-3">
            <h6>活动信息</h6>
            <p>
                <strong>活动:</strong> ${reservation.event_name}<br>
                <strong>场馆:</strong> ${reservation.venue_name}<br>
                <strong>活动时间:</strong> ${eventStartDate} 至 ${eventEndDate}<br>
            </p>
        </div>
        
        <div class="mb-3">
            <h6>访客信息</h6>
            <p>
                <strong>访客ID:</strong> ${reservation.visitor_id}<br>
                <strong>用户名:</strong> ${reservation.visitor_username}<br>
                <strong>年龄段:</strong> ${reservation.age_group || '未提供'}<br>
                <strong>职业:</strong> ${reservation.occupation_type || '未提供'}<br>
                <strong>联系方式:</strong> ${reservation.email || '未提供'} ${reservation.phone ? `/ ${reservation.phone}` : ''}<br>
            </p>
        </div>
        
        <div class="mb-3">
            <h6>管理操作</h6>
            <div class="mb-2">
                <label class="form-label">备注</label>
                <textarea class="form-control" id="reservationNotes" rows="2">${reservation.notes || ''}</textarea>
            </div>
        </div>
    `;
    
    // 设置按钮数据和显示状态
    const actionBtns = document.getElementById('reservationActionBtns');
    const approveBtn = document.getElementById('approveReservationBtn');
    const rejectBtn = document.getElementById('rejectReservationBtn');
    
    approveBtn.setAttribute('data-id', reservation.reservation_id);
    rejectBtn.setAttribute('data-id', reservation.reservation_id);
    
    console.log('设置按钮数据:', reservation.reservation_id);
    
    // 如果预约已经处理过，则隐藏相应的按钮
    if (reservation.status === '已参加' || reservation.status === '已取消') {
        // 已经完成的预约，隐藏所有操作按钮
        actionBtns.style.display = 'none';
    } else if (reservation.status === '已拒绝') {
        // 已拒绝的预约，只显示批准按钮
        approveBtn.style.display = 'block';
        rejectBtn.style.display = 'none';
        actionBtns.style.display = 'block';
    } else if (reservation.status === '待审批') {
        // 待审批的预约，显示批准和拒绝按钮
        approveBtn.style.display = 'block';
        rejectBtn.style.display = 'block';
        actionBtns.style.display = 'block';
    } else if (reservation.status === '已批准') {
        // 已批准的预约，只显示拒绝按钮
        approveBtn.style.display = 'none';
        rejectBtn.style.display = 'block';
        actionBtns.style.display = 'block';
    } else {
        // 其他状态，显示两个按钮
        approveBtn.style.display = 'block';
        rejectBtn.style.display = 'block';
        actionBtns.style.display = 'block';
    }
    
    // 移除旧的事件监听器，避免重复绑定
    approveBtn.replaceWith(approveBtn.cloneNode(true));
    rejectBtn.replaceWith(rejectBtn.cloneNode(true));
    
    // 重新获取克隆后的按钮元素
    const newApproveBtn = document.getElementById('approveReservationBtn');
    const newRejectBtn = document.getElementById('rejectReservationBtn');
    
    // 重新绑定事件监听器
    newApproveBtn.addEventListener('click', function() {
        const reservationId = this.getAttribute('data-id');
        if (!reservationId) {
            console.error('预约ID未获取到:', this);
            alert('操作失败：无法获取预约ID');
            return;
        }
        console.log('批准预约，ID:', reservationId);
        updateReservationStatus(reservationId, '已批准', '已批准');
    });
    
    newRejectBtn.addEventListener('click', function() {
        const reservationId = this.getAttribute('data-id');
        if (!reservationId) {
            console.error('预约ID未获取到:', this);
            alert('操作失败：无法获取预约ID');
            return;
        }
        console.log('拒绝预约，ID:', reservationId);
        updateReservationStatus(reservationId, '已拒绝', '预约被拒绝');
    });
    
    // 获取模态框元素，确保只有一个模态框实例
    const modalElement = document.getElementById('reservationDetailModal');
    
    // 添加模态框关闭事件监听器
    modalElement.addEventListener('hidden.bs.modal', function() {
        console.log('模态框关闭，重新加载预约列表');
        const filterValue = document.getElementById('reservationStatusFilter').value;
        loadAdminReservations(filterValue);
    }, { once: true }); // 只触发一次
    
    // 显示模态框
    const modal = new bootstrap.Modal(modalElement);
    modal.show();
}

// 更新预约状态
function updateReservationStatus(reservationId, status, notes) {
    if (!authToken || !reservationId) {
        console.error('无法更新预约状态：Token或预约ID缺失', { authToken: !!authToken, reservationId });
        alert('更新失败：无法获取预约ID或用户未登录');
        return;
    }
    
    console.log('开始更新预约状态:', { reservationId, status, notes });
    
    // 获取用户输入的备注
    let userNotes = document.getElementById('reservationNotes').value;
    if (notes && !userNotes) {
        userNotes = notes;
    }
    
    // 构建请求数据
    const updateData = {
        status: status,
        notes: userNotes
    };
    
    console.log('发送更新请求:', {
        url: `${API_BASE_URL}/admin/reservations/${reservationId}`,
        method: 'PUT',
        token: authToken.substring(0, 10) + '...',
        data: updateData
    });
    
    fetch(`${API_BASE_URL}/admin/reservations/${reservationId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(updateData)
    })
    .then(response => {
        console.log('收到响应:', { status: response.status, ok: response.ok });
        if (!response.ok) {
            return response.json().then(data => {
                console.error('响应内容:', data);
                throw new Error(data.error || `更新状态失败 (${response.status})`);
            });
        }
        return response.json();
    })
    .then(data => {
        console.log('更新成功:', data);
        
        // 关闭模态框
        let reservationModal = bootstrap.Modal.getInstance(document.getElementById('reservationDetailModal'));
        if (reservationModal) {
            reservationModal.hide();
        } else {
            console.warn('模态框实例未找到');
        }
        
        // 重新加载预约列表
        const filterValue = document.getElementById('reservationStatusFilter').value;
        console.log('重新加载预约列表，过滤条件:', filterValue);
        loadAdminReservations(filterValue);
        
        // 显示成功提示
        alert(`预约状态已更新为: ${status}`);
    })
    .catch(error => {
        console.error('更新失败:', error);
        alert(`更新失败: ${error.message}`);
    });
}

// 加载管理员用户列表
function loadAdminVisitors(roleFilter = '') {
    if (!authToken) return;
    
    const tableBody = document.getElementById('adminVisitorsTable');
    if (!tableBody) return;
    
    tableBody.innerHTML = `
        <tr>
            <td colspan="6" class="text-center">
                <div class="spinner-border spinner-border-sm text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <span class="ms-2">加载中...</span>
            </td>
        </tr>
    `;
    
    let url = `${API_BASE_URL}/admin/visitors`;
    if (roleFilter) {
        url += `?role=${encodeURIComponent(roleFilter)}`;
    }
    
    fetch(url, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('加载用户失败');
        }
        return response.json();
    })
    .then(visitors => {
        if (visitors.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">暂无用户数据</td></tr>';
            return;
        }
        
        tableBody.innerHTML = '';
        visitors.forEach(visitor => {
            const row = document.createElement('tr');
            
            // 格式化日期
            const registrationDate = visitor.registration_date ? 
                new Date(visitor.registration_date).toLocaleDateString('zh-CN') : '未知';
            
            // 转换角色名称
            let roleName;
            switch(visitor.role) {
                case 'admin':
                    roleName = '系统管理员';
                    break;
                case 'venue_manager':
                    roleName = '场馆管理员';
                    break;
                default:
                    roleName = '普通用户';
            }
            
            row.innerHTML = `
                <td>${visitor.visitor_id}</td>
                <td>${visitor.username}</td>
                <td>${roleName}</td>
                <td>${visitor.email || '未提供'}</td>
                <td>${registrationDate}</td>
                <td>
                    <button class="btn btn-sm btn-outline-info view-visitor-btn" data-id="${visitor.visitor_id}">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            `;
            
            tableBody.appendChild(row);
            
            // 添加查看详情按钮事件（这里可以扩展为用户详情和编辑功能）
            row.querySelector('.view-visitor-btn').addEventListener('click', function() {
                // 改为直接加载用户详情而不是打开新窗口
                const visitorId = this.getAttribute('data-id');
                fetch(`${API_BASE_URL}/admin/visitors/${visitorId}`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`获取用户详情失败(${response.status})`);
                    }
                    return response.json();
                })
                .then(visitorData => {
                    // 显示用户详情
                    alert(`用户 ${visitorData.visitor.username} 的详细信息已加载。完整信息请查看控制台。`);
                    console.log('用户详情:', visitorData);
                })
                .catch(error => {
                    alert(`获取用户详情失败: ${error.message}`);
                });
            });
        });
    })
    .catch(error => {
        console.error('加载用户列表错误:', error);
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">加载失败: ${error.message}</td></tr>`;
    });
}

// 获取活动状态对应的徽章样式
function getEventStatusBadgeClass(status) {
    switch (status) {
        case '计划中':
            return 'bg-info';
        case '正在进行':
            return 'bg-success';
        case '已结束':
            return 'bg-secondary';
        case '已取消':
            return 'bg-danger';
        default:
            return 'bg-secondary';
    }
}

// 加载用户个人信息
function loadUserProfile() {
    if (!authToken || !currentUser) {
        showLoginModal();
        return;
    }
    
    // 填充表单数据
    document.getElementById('profileUsername').value = currentUser.username;
    document.getElementById('profileEmail').value = currentUser.email || '';
    document.getElementById('profilePhone').value = currentUser.phone || '';
    
    if (currentUser.age_group) {
        document.getElementById('profileAgeGroup').value = currentUser.age_group;
    }
    
    if (currentUser.occupation_type) {
        document.getElementById('profileOccupation').value = currentUser.occupation_type;
    }
    
    if (currentUser.gender) {
        document.getElementById('profileGender').value = currentUser.gender;
    }
    
    if (currentUser.education_level) {
        document.getElementById('profileEducation').value = currentUser.education_level;
    }
    
    // 清除之前的错误/成功信息
    document.getElementById('profileError').classList.add('d-none');
    document.getElementById('profileSuccess').classList.add('d-none');
    
    // 显示模态框 - 使用获取已存在实例或创建新实例的方式
    let profileModal = bootstrap.Modal.getInstance(document.getElementById('profileModal'));
    if (!profileModal) {
        profileModal = new bootstrap.Modal(document.getElementById('profileModal'));
    }
    profileModal.show();
}

// 更新用户个人信息
function updateUserProfile() {
    if (!authToken) {
        return;
    }
    
    const formData = {
        email: document.getElementById('profileEmail').value,
        phone: document.getElementById('profilePhone').value,
        age_group: document.getElementById('profileAgeGroup').value,
        occupation_type: document.getElementById('profileOccupation').value,
        gender: document.getElementById('profileGender').value,
        education_level: document.getElementById('profileEducation').value
    };
    
    // 如果填写了密码字段，添加密码更新信息
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    
    if (currentPassword && newPassword) {
        formData.current_password = currentPassword;
        formData.new_password = newPassword;
    }
    
    fetch(`${API_BASE_URL}/profile`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(formData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || '更新个人信息失败');
            });
        }
        return response.json();
    })
    .then(data => {
        // 显示成功信息
        const successElement = document.getElementById('profileSuccess');
        successElement.textContent = '个人信息更新成功';
        successElement.classList.remove('d-none');
        
        // 更新当前用户信息
        getCurrentUser();
        
        // 清空密码字段
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        
        // 3秒后自动关闭模态框
        setTimeout(() => {
            let profileModal = bootstrap.Modal.getInstance(document.getElementById('profileModal'));
            if (profileModal) {
                profileModal.hide();
            }
        }, 3000);
    })
    .catch(error => {
        // 显示错误信息
        const errorElement = document.getElementById('profileError');
        errorElement.textContent = error.message;
        errorElement.classList.remove('d-none');
    });
}

// 更新导航高亮
function updateActiveNav(sectionId) {
    const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
    navLinks.forEach(link => {
        if (link.getAttribute('data-section') === sectionId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// 显示登录模态框
function showLoginModal() {
    const loginModal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
    loginModal.show();
}

// 显示注册模态框
function showRegisterModal() {
    const registerModal = bootstrap.Modal.getInstance(document.getElementById('registerModal'));
    registerModal.show();
}

// 显示个人信息模态框
function showProfileModal() {
    let profileModal = bootstrap.Modal.getInstance(document.getElementById('profileModal'));
    if (!profileModal) {
        profileModal = new bootstrap.Modal(document.getElementById('profileModal'));
    }
    profileModal.show();
}

// 显示创建活动模态框
function showEventModal() {
    const eventModal = bootstrap.Modal.getInstance(document.getElementById('eventModal'));
    eventModal.show();
}

// 显示活动详情模态框
function showEventDetailModal() {
    const eventDetailModal = bootstrap.Modal.getInstance(document.getElementById('eventDetailModal'));
    eventDetailModal.show();
}

// 显示预约详情模态框
function showReservationDetailModal() {
    const reservationDetailModal = bootstrap.Modal.getInstance(document.getElementById('reservationDetailModal'));
    reservationDetailModal.show();
}

// 显示访客模态框
function showVisitorModal() {
    const visitorModal = bootstrap.Modal.getInstance(document.getElementById('visitorModal'));
    visitorModal.show();
}

// 显示管理后台模态框
function showAdminModal() {
    const adminModal = bootstrap.Modal.getInstance(document.getElementById('adminModal'));
    adminModal.show();
}

// 显示活动详情模态框
function showEventDetail(eventId) {
    fetch(`${API_BASE_URL}/events/${eventId}`)
        .then(response => response.json())
        .then(data => {
            if (data.event) {
                const event = data.event;
                const startDate = new Date(event.start_date).toLocaleDateString();
                const endDate = new Date(event.end_date).toLocaleDateString();
                
                // 设置模态框内容
                document.getElementById('eventDetailTitle').textContent = event.name;
                
                const content = `
                    <div class="row">
                        <div class="col-md-8">
                            <p><strong>类型：</strong>${event.type}</p>
                            <p><strong>场馆：</strong>${event.venue_name}</p>
                            <p><strong>地址：</strong>${event.venue_address}</p>
                            <p><strong>时间：</strong>${startDate} 至 ${endDate}</p>
                            <p><strong>是否需要门票：</strong>${event.ticket_required ? '是' : '否'}</p>
                            <div class="mt-3">
                                <h6>活动介绍</h6>
                                <p>${event.description || '暂无介绍'}</p>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card mb-3">
                                <div class="card-body">
                                    <h6 class="card-title">预约统计</h6>
                                    <p class="mb-1">总预约数：${data.reservation_stats?.total_reservations || 0}</p>
                                    <p class="mb-1">已参加：${data.reservation_stats?.attended || 0}</p>
                                    <p class="mb-0">已取消：${data.reservation_stats?.cancelled || 0}</p>
                                </div>
                            </div>
                            <div class="card">
                                <div class="card-body">
                                    <h6 class="card-title">访客评价</h6>
                                    <p class="mb-0">
                                        <i class="fas fa-star text-warning me-1"></i>
                                        平均满意度：${data.satisfaction?.avg_satisfaction ? data.satisfaction.avg_satisfaction.toFixed(1) + '分' : '暂无评价'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                
                document.getElementById('eventDetailContent').innerHTML = content;
                
                // 设置预约按钮的活动ID
                document.getElementById('reserveEventBtn').setAttribute('data-event-id', event.event_id);
                
                // 显示模态框
                const modal = new bootstrap.Modal(document.getElementById('eventDetailModal'));
                modal.show();
            }
        })
        .catch(error => {
            console.error('获取活动详情错误:', error);
        });
}
  