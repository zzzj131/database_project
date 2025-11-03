-- 使用数据库
USE wuhan_cultural_facilities1;

-- 1. 各文化场馆的月度访客流量趋势分析
SELECT 
    v.name AS venue_name,
    v.type AS venue_type,
    DATE_FORMAT(vv.visit_date, '%Y-%m') AS visit_month,
    COUNT(*) AS visitor_count
FROM 
    Venue_Visits vv
JOIN 
    Venues v ON vv.venue_id = v.venue_id
GROUP BY 
    v.venue_id, visit_month
ORDER BY 
    v.name, visit_month;

-- 2. 按场馆类型统计访客总量
SELECT 
    v.type AS venue_type, 
    COUNT(*) AS total_visits,
    COUNT(DISTINCT vv.visitor_id) AS unique_visitors
FROM 
    Venue_Visits vv
JOIN 
    Venues v ON vv.venue_id = v.venue_id
GROUP BY 
    v.type
ORDER BY 
    total_visits DESC;

-- 3. 不同类型展览/活动的受欢迎程度
SELECT 
    ee.type AS event_type,
    COUNT(DISTINCT vv.visitor_id) AS unique_visitors,
    AVG(vv.satisfaction_rating) AS avg_satisfaction
FROM 
    Venue_Visits vv
JOIN 
    Exhibitions_Events ee ON vv.event_id = ee.event_id
WHERE 
    vv.satisfaction_rating IS NOT NULL
GROUP BY 
    ee.type
ORDER BY 
    unique_visitors DESC;

-- 4. 最受欢迎的10个展览/活动
SELECT 
    ee.name AS event_name,
    v.name AS venue_name,
    ee.type AS event_type,
    COUNT(*) AS visitor_count,
    AVG(vv.satisfaction_rating) AS avg_satisfaction
FROM 
    Venue_Visits vv
JOIN 
    Exhibitions_Events ee ON vv.event_id = ee.event_id
JOIN 
    Venues v ON ee.venue_id = v.venue_id
GROUP BY 
    ee.event_id
ORDER BY 
    visitor_count DESC, avg_satisfaction DESC
LIMIT 10;

-- 5. 访客年龄段分布分析
SELECT 
    vis.age_group,
    COUNT(*) AS visit_count,
    COUNT(DISTINCT vis.visitor_id) AS unique_visitors
FROM 
    Venue_Visits vv
JOIN 
    Visitors vis ON vv.visitor_id = vis.visitor_id
GROUP BY 
    vis.age_group
ORDER BY 
    visit_count DESC;

-- 6. 不同年龄段访客的场馆偏好
SELECT 
    vis.age_group,
    v.type AS venue_type,
    COUNT(*) AS visit_count
FROM 
    Venue_Visits vv
JOIN 
    Visitors vis ON vv.visitor_id = vis.visitor_id
JOIN 
    Venues v ON vv.venue_id = v.venue_id
GROUP BY 
    vis.age_group, v.type
ORDER BY 
    vis.age_group, visit_count DESC;

-- 7. 不同职业访客的场馆偏好
SELECT 
    vis.occupation_type,
    v.type AS venue_type,
    COUNT(*) AS visit_count
FROM 
    Venue_Visits vv
JOIN 
    Visitors vis ON vv.visitor_id = vis.visitor_id
JOIN 
    Venues v ON vv.venue_id = v.venue_id
GROUP BY 
    vis.occupation_type, v.type
ORDER BY 
    vis.occupation_type, visit_count DESC;

-- 8. 访客满意度分析
SELECT 
    v.name AS venue_name,
    v.type AS venue_type,
    COUNT(vv.satisfaction_rating) AS rated_visits,
    AVG(vv.satisfaction_rating) AS avg_satisfaction,
    (SELECT COUNT(*) FROM Venue_Visits WHERE venue_id = v.venue_id) AS total_visits
FROM 
    Venue_Visits vv
JOIN 
    Venues v ON vv.venue_id = v.venue_id
WHERE 
    vv.satisfaction_rating IS NOT NULL
GROUP BY 
    v.venue_id
ORDER BY 
    avg_satisfaction DESC;

-- 9. 周末vs工作日的访问量比较
SELECT 
    CASE 
        WHEN DAYOFWEEK(vv.visit_date) IN (1, 7) THEN '周末'
        ELSE '工作日'
    END AS day_type,
    COUNT(*) AS visit_count,
    COUNT(DISTINCT vv.visitor_id) AS unique_visitors
FROM 
    Venue_Visits vv
GROUP BY 
    day_type;

-- 10. 访问高峰时段分析
SELECT 
    HOUR(vv.visit_time) AS visit_hour,
    COUNT(*) AS visit_count
FROM 
    Venue_Visits vv
GROUP BY 
    visit_hour
ORDER BY 
    visit_hour;

-- 11. 不同教育水平访客的场馆偏好
SELECT 
    vis.education_level,
    v.type AS venue_type,
    COUNT(*) AS visit_count
FROM 
    Venue_Visits vv
JOIN 
    Visitors vis ON vv.visitor_id = vis.visitor_id
JOIN 
    Venues v ON vv.venue_id = v.venue_id
GROUP BY 
    vis.education_level, v.type
ORDER BY 
    vis.education_level, visit_count DESC;

-- 12. 活动预约成功率分析
SELECT 
    e.name AS event_name,
    COUNT(*) AS total_reservations,
    SUM(CASE WHEN er.status = '已参加' THEN 1 ELSE 0 END) AS attended,
    SUM(CASE WHEN er.status = '已取消' THEN 1 ELSE 0 END) AS cancelled,
    (SUM(CASE WHEN er.status = '已参加' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) AS attendance_rate
FROM 
    Event_Reservations er
JOIN 
    Exhibitions_Events e ON er.event_id = e.event_id
GROUP BY 
    e.event_id
ORDER BY 
    attendance_rate DESC;

-- 13. 有参加活动vs无参加活动的访客满意度比较
SELECT 
    CASE WHEN vv.event_id IS NULL THEN '未参加活动' ELSE '参加了活动' END AS activity_status,
    AVG(vv.satisfaction_rating) AS avg_satisfaction,
    COUNT(*) AS visit_count
FROM 
    Venue_Visits vv
WHERE 
    vv.satisfaction_rating IS NOT NULL
GROUP BY 
    activity_status;

-- 14. 各区域场馆访问量分析
SELECT 
    v.district,
    COUNT(*) AS visit_count,
    COUNT(DISTINCT vv.visitor_id) AS unique_visitors
FROM 
    Venue_Visits vv
JOIN 
    Venues v ON vv.venue_id = v.venue_id
GROUP BY 
    v.district
ORDER BY 
    visit_count DESC;

-- 15. 典型访客画像分析（组合多维度）
SELECT 
    vis.age_group,
    vis.gender,
    vis.occupation_type,
    vis.education_level,
    COUNT(*) AS visit_count
FROM 
    Venue_Visits vv
JOIN 
    Visitors vis ON vv.visitor_id = vis.visitor_id
GROUP BY 
    vis.age_group, vis.gender, vis.occupation_type, vis.education_level
HAVING 
    COUNT(*) > 50  -- 筛选出较为典型的组合
ORDER BY 
    visit_count DESC
LIMIT 10;

-- 16. 季节性访问趋势分析
SELECT 
    QUARTER(vv.visit_date) AS quarter,
    MONTHNAME(vv.visit_date) AS month_name,
    COUNT(*) AS visit_count
FROM 
    Venue_Visits vv
GROUP BY 
    quarter, month_name
ORDER BY 
    quarter, month_name;

-- 17. 单个场馆最受欢迎的活动
SELECT 
    v.name AS venue_name,
    ee.name AS event_name,
    COUNT(*) AS visitor_count,
    AVG(vv.satisfaction_rating) AS avg_satisfaction
FROM 
    Venue_Visits vv
JOIN 
    Exhibitions_Events ee ON vv.event_id = ee.event_id
JOIN 
    Venues v ON ee.venue_id = v.venue_id
GROUP BY 
    ee.venue_id, ee.event_id
ORDER BY 
    ee.venue_id, visitor_count DESC;

-- 18. 访客回访率分析
WITH visitor_frequency AS (
    SELECT 
        visitor_id,
        venue_id,
        COUNT(*) AS visit_count
    FROM 
        Venue_Visits
    GROUP BY 
        visitor_id, venue_id
)
SELECT 
    visit_count AS frequency,
    COUNT(*) AS visitor_count
FROM 
    visitor_frequency
GROUP BY 
    visit_count
ORDER BY 
    visit_count;

-- 19. 访客反馈词云数据（提取常见反馈）
SELECT 
    feedback,
    COUNT(*) AS frequency
FROM 
    Venue_Visits
WHERE 
    feedback IS NOT NULL
GROUP BY 
    feedback
ORDER BY 
    frequency DESC
LIMIT 100;

-- 20. 不同性别访客的场馆偏好
SELECT 
    vis.gender,
    v.type AS venue_type,
    COUNT(*) AS visit_count
FROM 
    Venue_Visits vv
JOIN 
    Visitors vis ON vv.visitor_id = vis.visitor_id
JOIN 
    Venues v ON vv.venue_id = v.venue_id
GROUP BY 
    vis.gender, v.type
ORDER BY 
    vis.gender, visit_count DESC; 