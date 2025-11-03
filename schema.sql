-- 创建数据库
CREATE DATABASE IF NOT EXISTS wuhan_cultural_facilities1;

USE wuhan_cultural_facilities1;

-- 场馆表
CREATE TABLE Venues (
    venue_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    type ENUM('图书馆', '博物馆', '美术馆', '文化中心') NOT NULL,
    address VARCHAR(200) NOT NULL,
    district VARCHAR(50) NOT NULL,  -- 所在区
    opening_hours VARCHAR(100) NOT NULL,
    contact_info VARCHAR(100),
    introduction TEXT,
    ticket_info VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 访客表
CREATE TABLE Visitors (
    visitor_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin', 'venue_manager') DEFAULT 'user',
    age_group ENUM('儿童(0-12)', '青少年(13-18)', '青年(19-30)', '中年(31-50)', '老年(51+)') NOT NULL,
    occupation_type ENUM('学生', '教师', '公务员', '企业职员', '自由职业', '退休人员', '其他') NOT NULL,
    gender ENUM('男', '女', '其他') NOT NULL,
    education_level ENUM('小学及以下', '初中', '高中', '大专/本科', '研究生及以上') NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20),
    managed_venue_id INT,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (managed_venue_id) REFERENCES Venues(venue_id)
);

-- 展览和活动表
CREATE TABLE Exhibitions_Events (
    event_id INT PRIMARY KEY AUTO_INCREMENT,
    venue_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,
    type ENUM('常设展览', '临时展览', '讲座', '工作坊', '表演', '其他活动') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    description TEXT,
    capacity INT,
    ticket_required BOOLEAN DEFAULT FALSE,
    status ENUM('计划中', '正在进行', '已结束', '已取消') DEFAULT '计划中',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (venue_id) REFERENCES Venues(venue_id),
    FOREIGN KEY (created_by) REFERENCES Visitors(visitor_id)
);

-- 用户会话表
CREATE TABLE Sessions (
    session_id VARCHAR(64) PRIMARY KEY,
    visitor_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    FOREIGN KEY (visitor_id) REFERENCES Visitors(visitor_id)
);

-- 访问记录表
CREATE TABLE Venue_Visits (
    visit_id INT PRIMARY KEY AUTO_INCREMENT,
    venue_id INT NOT NULL,
    visitor_id INT NOT NULL,
    visit_date DATE NOT NULL,
    visit_time TIME NOT NULL,
    event_id INT,
    satisfaction_rating INT,
    feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (venue_id) REFERENCES Venues(venue_id),
    FOREIGN KEY (visitor_id) REFERENCES Visitors(visitor_id),
    FOREIGN KEY (event_id) REFERENCES Exhibitions_Events(event_id)
);

-- 活动预约表
CREATE TABLE Event_Reservations (
    reservation_id INT PRIMARY KEY AUTO_INCREMENT,
    event_id INT NOT NULL,
    visitor_id INT NOT NULL,
    reservation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('待审批', '已批准', '已参加', '已取消', '已拒绝') DEFAULT '待审批',
    notes TEXT,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES Exhibitions_Events(event_id),
    FOREIGN KEY (visitor_id) REFERENCES Visitors(visitor_id),
    FOREIGN KEY (updated_by) REFERENCES Visitors(visitor_id)
); 


CREATE TRIGGER trg_event_reservations_before_update
BEFORE UPDATE ON Event_Reservations
FOR EACH ROW
BEGIN
    SET NEW.updated_at = NOW();

END


CREATE TRIGGER trg_prevent_venue_deletion_if_events_exist
BEFORE DELETE ON Venues
FOR EACH ROW
BEGIN
    DECLARE event_count INT;
    SELECT COUNT(*) INTO event_count
    FROM Exhibitions_Events
    WHERE venue_id = OLD.venue_id;

    IF event_count > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = '无法删除该场馆，因为它尚有关联的活动。请先处理这些活动。';
    END IF;
END


CREATE PROCEDURE sp_get_top_n_popular_events_for_venue(
    IN p_venue_id INT,
    IN p_top_n INT
)
BEGIN
    SELECT
        ee.event_id,
        ee.name AS event_name,
        ee.type AS event_type,
        v.name AS venue_name,
        COUNT(er.reservation_id) AS total_reservations,
        ee.start_date,
        ee.end_date
    FROM Exhibitions_Events ee
    JOIN Venues v ON ee.venue_id = v.venue_id
    LEFT JOIN Event_Reservations er ON ee.event_id = er.event_id
    WHERE ee.venue_id = p_venue_id
    GROUP BY ee.event_id, ee.name, ee.type, v.name, ee.start_date, ee.end_date
    ORDER BY total_reservations DESC
    LIMIT p_top_n;
END


CREATE PROCEDURE sp_end_event(
    IN p_event_id INT,
    IN p_admin_id INT -- 假设操作由管理员执行
)
BEGIN
    UPDATE Exhibitions_Events
    SET
        status = '已结束',
        updated_at = NOW() 
    WHERE event_id = p_event_id;

    SELECT '活动 ' || p_event_id || ' 已成功更新为"已结束"' AS message;
END


CREATE PROCEDURE sp_register_new_visitor(
    IN p_username VARCHAR(255),
    IN p_password VARCHAR(255), -- 实际应用中密码应哈希处理
    IN p_age_group ENUM('儿童(0-12)', '青少年(13-18)', '青年(19-30)', '中年(31-50)', '老年(51+)'),
    IN p_occupation_type ENUM('学生', '教师', '公务员', '企业职员', '自由职业', '退休人员', '其他'),
    IN p_gender ENUM('男', '女', '其他'),
    IN p_education_level ENUM('小学及以下', '初中', '高中', '大专/本科', '研究生及以上'),
    IN p_email VARCHAR(255),
    IN p_phone VARCHAR(20),
    OUT p_visitor_id INT,
    OUT p_message VARCHAR(255)
)
BEGIN
    DECLARE user_exists INT DEFAULT 0;
    DECLARE email_exists INT DEFAULT 0;

    -- 检查用户名是否已存在
    SELECT COUNT(*) INTO user_exists FROM Visitors WHERE username = p_username;
    IF user_exists > 0 THEN
        SET p_visitor_id = NULL;
        SET p_message = '注册失败：用户名已存在。';
    ELSE
        -- 检查邮箱是否已存在 (如果提供了邮箱)
        IF p_email IS NOT NULL AND p_email != '' THEN
            SELECT COUNT(*) INTO email_exists FROM Visitors WHERE email = p_email;
        END IF;

        IF email_exists > 0 THEN
            SET p_visitor_id = NULL;
            SET p_message = '注册失败：邮箱已被注册。';
        ELSE
            -- 插入新访客信息
            INSERT INTO Visitors (
                username,
                password,
                role, -- 默认为 'user'
                age_group,
                occupation_type,
                gender,
                education_level,
                email,
                phone,
                registration_date
            ) VALUES (
                p_username,
                p_password, -- 注意：生产环境密码应加密存储
                'user',
                p_age_group,
                p_occupation_type,
                p_gender,
                p_education_level,
                p_email,
                p_phone,
                NOW()
            );
            SET p_visitor_id = LAST_INSERT_ID();
            SET p_message = '访客注册成功！';
        END IF;
    END IF;
END



CREATE ROLE IF NOT EXISTS 'visitor_role';
CREATE ROLE IF NOT EXISTS 'venue_manager_role';
CREATE ROLE IF NOT EXISTS 'app_admin_role';



GRANT SELECT ON wuhan_cultural_facilities.Venues TO 'visitor_role';
GRANT SELECT ON wuhan_cultural_facilities.Exhibitions_Events TO 'visitor_role';
GRANT SELECT, INSERT ON wuhan_cultural_facilities.Event_Reservations TO 'visitor_role';
GRANT UPDATE (status, notes) ON wuhan_cultural_facilities1.Event_Reservations TO 'visitor_role';
GRANT SELECT, INSERT ON wuhan_cultural_facilities1.Venue_Visits TO 'visitor_role';
GRANT SELECT ON wuhan_cultural_facilities1.Visitors TO 'visitor_role';
GRANT UPDATE (age_group, occupation_type, gender, education_level, email, phone, password) ON wuhan_cultural_facilities.Visitors TO 'visitor_role';
GRANT SELECT ON wuhan_cultural_facilities1.Sessions TO 'visitor_role';



GRANT 'visitor_role' TO 'venue_manager_role';
GRANT SELECT, INSERT, UPDATE, DELETE ON wuhan_cultural_facilities1.Exhibitions_Events TO 'venue_manager_role';
GRANT SELECT, UPDATE (status, notes) ON wuhan_cultural_facilities1.Event_Reservations TO 'venue_manager_role';
GRANT SELECT ON wuhan_cultural_facilities1.Venue_Visits TO 'venue_manager_role';
GRANT SELECT (visitor_id, username, age_group, occupation_type, email, phone) ON wuhan_cultural_facilities1.Visitors TO 'venue_manager_role';
GRANT SELECT, UPDATE ON wuhan_cultural_facilities1.Venues TO 'venue_manager_role';
GRANT ALL PRIVILEGES ON wuhan_cultural_facilities1.* TO 'app_admin_role';