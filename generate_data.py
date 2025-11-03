import random
import mysql.connector
from datetime import datetime, timedelta
import faker
import hashlib  # 用于密码哈希

# 创建Faker实例，生成中文数据
fake = faker.Faker('zh_CN')

# 数据库连接
def get_db_connection():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="",  # 请修改为你的数据库密码
        database="wuhan_cultural_facilities1"
    )

# 生成场馆数据
def generate_venues(cursor):
    venues = [
        # 武汉市主要图书馆
        ('武汉市图书馆', '图书馆', '武汉市江岸区胜利街65号', '江岸区', '周二至周日 9:00-17:00', '027-82810715', 
         '武汉市图书馆创建于1904年，是湖北省规模最大的公共图书馆之一。', '免费'),
        ('湖北省图书馆', '图书馆', '武汉市武昌区张之洞路58号', '武昌区', '周二至周日 9:00-17:00', '027-86795547', 
         '湖北省图书馆是国家一级图书馆，创建于1904年。', '免费'),
        ('湖北省少年儿童图书馆', '图书馆', '武汉市武昌区民主路213号', '武昌区', '周二至周日 9:00-17:00', '027-88844487', 
         '湖北省少年儿童图书馆是全国较大的少儿图书馆之一。', '免费'),
        
        # 武汉市主要博物馆
        ('湖北省博物馆', '博物馆', '武汉市武昌区东湖路160号', '武昌区', '周二至周日 9:00-17:00（16:00停止入场）', '027-86794127', 
         '湖北省博物馆是中国重要的历史艺术类博物馆之一，收藏了大量楚文化文物。', '免费，需预约'),
        ('武汉博物馆', '博物馆', '武汉市江岸区解放公园路', '江岸区', '周二至周日 9:00-17:00', '027-65698001', 
         '武汉博物馆是一座地志类博物馆，展示了武汉三镇的历史变迁。', '免费'),
        ('辛亥革命博物馆', '博物馆', '武汉市武昌区阅马场首义路', '武昌区', '周二至周日 9:00-17:00', '027-88866717', 
         '辛亥革命博物馆是全国爱国主义教育示范基地，位于1911年武昌起义爆发地。', '免费'),
        ('中国地质大学逸夫博物馆', '博物馆', '武汉市洪山区鲁磨路388号', '洪山区', '周二至周日 9:00-16:30', '027-67883448', 
         '中国地质大学逸夫博物馆是国内高校最大的地质类博物馆之一。', '免费'),
        
        # 武汉市主要美术馆
        ('湖北美术馆', '美术馆', '武汉市武昌区东湖路武汉美术馆路1号', '武昌区', '周二至周日 9:00-17:00', '027-86793809', 
         '湖北美术馆是湖北省规模最大的美术展览馆。', '免费，特展需购票'),
        ('武汉美术馆', '美术馆', '武汉市江汉区解放大道1008号', '江汉区', '周二至周日 9:00-17:00', '027-85791196', 
         '武汉美术馆是武汉市重要的艺术展示平台。', '免费，特展需购票'),
        
        # 武汉市主要文化中心
        ('武汉群艺馆', '文化中心', '武汉市江岸区京汉大道1162号', '江岸区', '周二至周日 9:00-17:00', '027-82800244', 
         '武汉群艺馆是武汉市重要的群众文化活动中心。', '免费，部分活动需购票'),
        ('武汉琴台大剧院', '文化中心', '武汉市汉阳区龟山北路58号', '汉阳区', '演出时间因节目而异', '027-84889088', 
         '武汉琴台大剧院是武汉市标志性文化建筑。', '根据演出定价')
    ]
    
    for venue in venues:
        query = """
        INSERT INTO Venues (name, type, address, district, opening_hours, contact_info, introduction, ticket_info)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        cursor.execute(query, venue)
    
    print(f"已生成 {len(venues)} 条场馆数据")
    return cursor.lastrowid

# 生成展览和活动数据
def generate_exhibitions_events(cursor, num_events=50):
    # 获取所有场馆ID
    cursor.execute("SELECT venue_id, type FROM Venues")
    venues = cursor.fetchall()
    
    event_types = {
        '图书馆': ['讲座', '工作坊',  '其他活动'],
        '博物馆': ['常设展览', '临时展览', '讲座', '工作坊'],
        '美术馆': ['常设展览', '临时展览', '讲座'],
        '文化中心': ['表演', '工作坊', '讲座', '其他活动']
    }
    
    event_names = {
        '常设展览': [
            '湖北历史文化展', '楚文化艺术展', '长江文明展', '武汉三镇发展史展', 
            '近代中国工业展', '湖北民俗文化展', '武汉自然生态展', '地质奇观展'
        ],
        '临时展览': [
            '当代艺术特展', '国际摄影展', '文物修复技术展', '丝绸之路文化展',
            '中国古代书画展', '世界文化遗产展', '数字技术与文化遗产展', '青年艺术家联展'
        ],
        '讲座': [
            '中国传统文化解读', '博物馆与城市发展', '文学经典赏析', '科技创新与未来',
            '艺术鉴赏与收藏', '历史人物解读', '环境保护与可持续发展', '健康生活方式'
        ],
        '工作坊': [
            '传统手工艺体验', '创意写作工作坊', '科学实验室', '艺术创作工作坊',
            '环保DIY工作坊', '编程启蒙工作坊', '古籍修复体验', '中国结制作'
        ],
        '表演': [
            '民乐演奏会', '戏曲专场', '交响音乐会', '街舞表演',
            '儿童剧场', '合唱音乐会', '武汉非物质文化遗产展演', '现代舞蹈表演'
        ],
        '其他活动': [
            '亲子共读日', '文化沙龙', '电影放映会', '读书会',
            '文化遗产保护志愿者活动', '社区文化节', '青少年科普日', '老年人文化活动'
        ]
    }
    
    descriptions = {
        '常设展览': '本展览长期陈列，展示%s的丰富内容，欢迎公众前来参观。',
        '临时展览': '特别策划的临时展览，展期有限，展示%s的精彩内容。',
        '讲座': '邀请专家进行的%s主题讲座，欢迎感兴趣的观众参加。',
        '工作坊': '互动性强的%s体验活动，适合各年龄段参与者。',
        '表演': '精彩的%s，为观众带来视听盛宴。',
        '其他活动': '丰富多彩的%s，促进文化交流与分享。'
    }
    
    # 生成当前日期前后一年的随机日期
    start_date = datetime.now() - timedelta(days=365)
    end_date = datetime.now() + timedelta(days=365)
    
    events = []
    for _ in range(num_events):
        venue_id, venue_type = random.choice(venues)
        event_type = random.choice(event_types[venue_type])
        event_name = random.choice(event_names[event_type])
        
        # 生成随机开始日期和结束日期
        event_start = start_date + timedelta(days=random.randint(0, 730))
        
        # 展览通常持续时间较长，活动则较短
        if '展览' in event_type:
            duration = random.randint(30, 180)  # 展览持续1-6个月
        else:
            duration = random.randint(1, 7)  # 活动持续1-7天
            
        event_end = event_start + timedelta(days=duration)
        
        # 生成描述
        description = descriptions[event_type] % event_name
        
        # 生成容量和是否需要门票
        capacity = random.randint(30, 500) if event_type != '常设展览' else None
        ticket_required = random.choice([True, False]) if event_type != '常设展览' else False
        
        events.append((
            venue_id,
            event_name,
            event_type,
            event_start.date(),
            event_end.date(),
            description,
            capacity,
            ticket_required
        ))
    
    query = """
    INSERT INTO Exhibitions_Events (venue_id, name, type, start_date, end_date, description, capacity, ticket_required)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    cursor.executemany(query, events)
    print(f"已生成 {len(events)} 条展览和活动数据")

# 生成访客数据
def generate_visitors(cursor, num_visitors=1000):
    age_groups = ['儿童(0-12)', '青少年(13-18)', '青年(19-30)', '中年(31-50)', '老年(51+)']
    occupation_types = ['学生', '教师', '公务员', '企业职员', '自由职业', '退休人员', '其他']
    genders = ['男', '女', '其他']
    education_levels = ['小学及以下', '初中', '高中', '大专/本科', '研究生及以上']
    
    # 调整不同年龄组的概率分布
    age_weights = [0.15, 0.15, 0.3, 0.25, 0.15]  # 青年和中年访客更多
    
    # 存储已生成的用户名和邮箱，确保唯一性
    generated_usernames = set()
    generated_emails = set()
    
    visitors = []
    for i in range(num_visitors):
        age_group = random.choices(age_groups, weights=age_weights)[0]
        
        # 根据年龄组调整职业和教育水平的概率
        if age_group == '儿童(0-12)':
            occupation = '学生'
            education = '小学及以下'
        elif age_group == '青少年(13-18)':
            occupation = '学生'
            education = random.choices(['初中', '高中'], weights=[0.6, 0.4])[0]
        elif age_group == '青年(19-30)':
            occupation = random.choices(occupation_types, weights=[0.4, 0.1, 0.1, 0.2, 0.1, 0, 0.1])[0]
            education = random.choices(['高中', '大专/本科', '研究生及以上'], weights=[0.1, 0.6, 0.3])[0]
        elif age_group == '中年(31-50)':
            occupation = random.choices(occupation_types, weights=[0.05, 0.15, 0.2, 0.3, 0.15, 0.05, 0.1])[0]
            education = random.choices(['初中', '高中', '大专/本科', '研究生及以上'], weights=[0.1, 0.2, 0.5, 0.2])[0]
        else:  # 老年(51+)
            occupation = random.choices(occupation_types, weights=[0, 0.1, 0.1, 0.1, 0.1, 0.5, 0.1])[0]
            education = random.choices(education_levels, weights=[0.1, 0.2, 0.3, 0.3, 0.1])[0]
        
        gender = random.choice(genders)
        
        # 生成用户名，使用Faker生成中文姓名并加上后缀确保唯一性
        while True:
            username = f"{fake.last_name()}{fake.first_name()}_{i}"
            if username not in generated_usernames:
                generated_usernames.add(username)
                break
        
        # 生成一个随机密码并进行简单的哈希处理
        raw_password = fake.password(length=8)
        hashed_password = hashlib.md5(raw_password.encode()).hexdigest()  # 在实际应用中，应使用更安全的哈希方法
        
        # 生成邮箱（50%概率）和电话（30%概率）
        email = None
        if random.random() < 0.5:
            # 生成唯一的邮箱地址
            while True:
                temp_email = f"{username.split('_')[0]}_{i}@{fake.domain_name()}"
                if temp_email not in generated_emails:
                    email = temp_email
                    generated_emails.add(email)
                    break
        
        phone = fake.phone_number() if random.random() < 0.3 else None
        
        visitors.append((
            username,
            hashed_password,
            age_group,
            occupation,
            gender,
            education,
            email,
            phone
        ))
    
    query = """
    INSERT INTO Visitors (username, password, age_group, occupation_type, gender, education_level, email, phone)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    cursor.executemany(query, visitors)
    print(f"已生成 {len(visitors)} 条访客数据")

# 生成访问记录数据
def generate_venue_visits(cursor, num_visits=10000):
    # 获取所有场馆ID
    cursor.execute("SELECT venue_id FROM Venues")
    venue_ids = [row[0] for row in cursor.fetchall()]
    
    # 获取所有访客ID
    cursor.execute("SELECT visitor_id FROM Visitors")
    visitor_ids = [row[0] for row in cursor.fetchall()]
    
    # 获取所有活动ID
    cursor.execute("SELECT event_id, venue_id, start_date, end_date FROM Exhibitions_Events")
    events = cursor.fetchall()
    
    # 为不同类型场馆设置权重，模拟受欢迎程度
    cursor.execute("SELECT venue_id, type FROM Venues")
    venue_types = {row[0]: row[1] for row in cursor.fetchall()}
    
    venue_type_weights = {
        '博物馆': 0.4,  # 博物馆最受欢迎
        '图书馆': 0.3,
        '美术馆': 0.2,
        '文化中心': 0.1
    }
    
    # 按类型分组场馆
    venue_by_type = {}
    for venue_id, venue_type in venue_types.items():
        if venue_type not in venue_by_type:
            venue_by_type[venue_type] = []
        venue_by_type[venue_type].append(venue_id)
    
    # 生成访问记录
    visits = []
    for _ in range(num_visits):
        # 首先随机选择场馆类型，然后从该类型中选择具体场馆
        venue_type = random.choices(list(venue_type_weights.keys()), 
                                 weights=list(venue_type_weights.values()))[0]
        venue_id = random.choice(venue_by_type[venue_type])
        
        visitor_id = random.choice(visitor_ids)
        
        # 生成随机日期，偏向最近一年
        days_ago = random.choices(range(365*2), weights=[2 if i < 365 else 1 for i in range(365*2)])[0]
        visit_date = (datetime.now() - timedelta(days=days_ago)).date()
        
        # 生成随机时间，考虑开放时间范围
        hour = random.randint(9, 16)
        minute = random.choice([0, 15, 30, 45])
        visit_time = f"{hour:02d}:{minute:02d}:00"
        
        # 确定是否参加了某个活动（30%的概率）
        attend_event = random.random() < 0.3
        event_id = None
        
        if attend_event:
            # 筛选当天在这个场馆有活动的事件
            possible_events = [e for e in events if e[1] == venue_id and e[2] <= visit_date <= e[3]]
            if possible_events:
                event_id = random.choice(possible_events)[0]
        
        # 可能有满意度评分（60%概率）
        has_rating = random.random() < 0.6
        satisfaction_rating = random.randint(3, 5) if has_rating else None
        
        # 可能有反馈（20%概率）
        has_feedback = random.random() < 0.2
        feedback = None
        
        if has_feedback:
            if satisfaction_rating and satisfaction_rating >= 4:
                feedback = random.choice([
                    "展览内容非常丰富，很有教育意义。",
                    "活动组织得很好，环境舒适。",
                    "讲解员专业知识丰富，讲解生动。",
                    "交通便利，设施完善。",
                    "很适合带孩子来参观学习。"
                ])
            elif satisfaction_rating and satisfaction_rating <= 2:
                feedback = random.choice([
                    "人太多了，体验不是很好。",
                    "展品说明不够详细。",
                    "开放时间太短了。",
                    "场馆内指示牌不够清晰。",
                    "周边餐饮和休息设施不足。"
                ])
            else:
                feedback = random.choice([
                    "整体还不错，但有提升空间。",
                    "部分展区很精彩，部分展区一般。",
                    "希望能增加互动性的展品。",
                    "建议增加外语讲解服务。",
                    "停车不太方便。"
                ])
        
        visits.append((
            venue_id,
            visitor_id,
            visit_date,
            visit_time,
            event_id,
            satisfaction_rating,
            feedback
        ))
    
    query = """
    INSERT INTO Venue_Visits (venue_id, visitor_id, visit_date, visit_time, event_id, satisfaction_rating, feedback)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    """
    
    cursor.executemany(query, visits)
    print(f"已生成 {len(visits)} 条访问记录数据")

# 生成活动预约数据
def generate_event_reservations(cursor, num_reservations=2000):
    # 获取所有需要预约的活动
    cursor.execute("SELECT event_id FROM Exhibitions_Events WHERE ticket_required = TRUE OR capacity IS NOT NULL")
    event_ids = [row[0] for row in cursor.fetchall()]
    
    if not event_ids:
        print("没有找到需要预约的活动")
        return
    
    # 获取所有访客ID
    cursor.execute("SELECT visitor_id FROM Visitors")
    visitor_ids = [row[0] for row in cursor.fetchall()]
    
    reservations = []
    for _ in range(num_reservations):
        event_id = random.choice(event_ids)
        visitor_id = random.choice(visitor_ids)
        
        # 预约状态，60%已参加，20%已批准，10%待审批，10%已取消
        status = random.choices(['已参加', '已批准', '待审批', '已取消'], weights=[0.6, 0.2, 0.1, 0.1])[0]
        
        # 为已参加的预约创建访问记录
        if status == '已参加':
            # 获取活动信息
            cursor.execute("SELECT venue_id, start_date, end_date FROM Exhibitions_Events WHERE event_id = %s", (event_id,))
            venue_id, start_date, end_date = cursor.fetchone()
            
            # 在活动日期范围内随机选择一天
            days_diff = (end_date - start_date).days
            if days_diff > 0:
                random_day = random.randint(0, days_diff)
                visit_date = start_date + timedelta(days=random_day)
            else:
                visit_date = start_date
            
            # 生成随机访问时间
            hour = random.randint(9, 16)
            minute = random.choice([0, 15, 30, 45])
            visit_time = f"{hour:02d}:{minute:02d}:00"
            
            # 添加访问记录
            visit_query = """
            INSERT INTO Venue_Visits (venue_id, visitor_id, visit_date, visit_time, event_id, satisfaction_rating)
            VALUES (%s, %s, %s, %s, %s, %s)
            """
            
            # 70%概率给出满意度评分
            satisfaction_rating = random.randint(1, 5) if random.random() < 0.7 else None
            
            cursor.execute(visit_query, (venue_id, visitor_id, visit_date, visit_time, event_id, satisfaction_rating))
        
        reservations.append((
            event_id,
            visitor_id,
            status
        ))
    
    query = """
    INSERT INTO Event_Reservations (event_id, visitor_id, status)
    VALUES (%s, %s, %s)
    """
    
    cursor.executemany(query, reservations)
    print(f"已生成 {len(reservations)} 条活动预约数据")

# 生成管理员账户
def generate_admin_user(cursor):
    # 生成一个管理员账户
    admin_username = "admin"
    admin_password = hashlib.md5("admin123".encode()).hexdigest()  # 密码：admin123
    
    admin_data = (
        admin_username,
        admin_password,
        'admin',  # 角色设为admin
        '中年(31-50)',  # 年龄段
        '企业职员',  # 职业
        '男',  # 性别
        '大专/本科',  # 教育水平
        'admin@wuhan-culture.com',  # 邮箱
        '13800138000'  # 电话
    )
    
    query = """
    INSERT INTO Visitors (username, password, role, age_group, occupation_type, gender, education_level, email, phone)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    try:
        cursor.execute(query, admin_data)
        print("已生成管理员账户，用户名: admin, 密码: admin123")
    except mysql.connector.Error as err:
        if err.errno == 1062:  # 重复键的错误代码
            print("管理员账户已存在，跳过创建")
        else:
            raise

# 主函数
def main():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # 生成各类数据（按照依赖关系的顺序）
        generate_venues(cursor)
        generate_visitors(cursor)
        generate_admin_user(cursor)  # 添加管理员账户
        generate_exhibitions_events(cursor)
        generate_venue_visits(cursor)
        generate_event_reservations(cursor)
        
        # 提交所有更改
        conn.commit()
        print("所有数据生成完成！")
        
    except mysql.connector.Error as err:
        print(f"发生错误: {err}")
        conn.rollback()
        
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    main()