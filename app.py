from flask import Flask, jsonify, request, render_template, session
import mysql.connector
import json
from datetime import datetime, date, timedelta
import pandas as pd
import numpy as np
import os
from flask_cors import CORS
import decimal  # 添加decimal模块
import uuid
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps

app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = os.urandom(24)  # 用于session加密
CORS(app)  # 启用跨域请求支持

# 数据库配置
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',  # 请修改为你的数据库密码
    'database': 'wuhan_cultural_facilities1',
    'auth_plugin': 'mysql_native_password'
}

# 自定义JSON编码器，处理日期等特殊类型
class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, decimal.Decimal):
            return float(obj)  # 将Decimal转换为float
        return super().default(obj)

app.json_encoder = CustomJSONEncoder

# 获取数据库连接
def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)

# 访问权限装饰器
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_token = request.headers.get('Authorization')
        
        if not auth_token:
            return jsonify({"error": "未登录，请先登录"}), 401
            
        # 检查token是否合法（格式为Bearer token）
        try:
            session_id = auth_token.split(' ')[1]
        except (IndexError, AttributeError):
            return jsonify({"error": "无效的认证令牌"}), 401
            
        # 在数据库中验证session
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            cursor.execute(
                "SELECT s.*, v.role FROM Sessions s JOIN Visitors v ON s.visitor_id = v.visitor_id WHERE s.session_id = %s AND s.expires_at > NOW()",
                (session_id,)
            )
            session = cursor.fetchone()
            
            if not session:
                return jsonify({"error": "会话已过期或无效，请重新登录"}), 401
                
            # 将用户信息存储在request中，以便后续使用
            request.user = {
                "visitor_id": session["visitor_id"],
                "role": session["role"]
            }
            
            return f(*args, **kwargs)
        finally:
            cursor.close()
            conn.close()
    
    return decorated_function

# 管理员权限装饰器
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # 先验证用户是否登录
        auth_token = request.headers.get('Authorization')
        
        if not auth_token:
            return jsonify({"error": "未登录，请先登录"}), 401
            
        # 检查token是否合法（格式为Bearer token）
        try:
            session_id = auth_token.split(' ')[1]
        except (IndexError, AttributeError):
            return jsonify({"error": "无效的认证令牌"}), 401
            
        # 在数据库中验证session
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            cursor.execute(
                "SELECT s.*, v.role FROM Sessions s JOIN Visitors v ON s.visitor_id = v.visitor_id WHERE s.session_id = %s AND s.expires_at > NOW()",
                (session_id,)
            )
            session = cursor.fetchone()
            
            if not session:
                return jsonify({"error": "会话已过期或无效，请重新登录"}), 401
                
            # 验证是否为管理员或场馆管理员
            if session["role"] not in ['admin', 'venue_manager']:
                return jsonify({"error": "无权限访问，需要管理员权限"}), 403
                
            # 将用户信息存储在request中，以便后续使用
            request.user = {
                "visitor_id": session["visitor_id"],
                "role": session["role"]
            }
            
            return f(*args, **kwargs)
        finally:
            cursor.close()
            conn.close()
    
    return decorated_function

# 首页
@app.route('/')
def index():
    return render_template('index.html')

# API路由：获取所有场馆
@app.route('/api/venues', methods=['GET'])
def get_venues():
    print("\n======== 开始处理场馆API请求 ========")
    conn = None
    cursor = None
    
    try:
        conn = get_db_connection()
        print("数据库连接成功")
        cursor = conn.cursor(dictionary=True)
        
        print("执行查询: SELECT * FROM Venues")
        query = "SELECT * FROM Venues"
        cursor.execute(query)
        venues = cursor.fetchall()
        
        print(f"查询返回场馆数量: {len(venues)}")
        if len(venues) > 0:
            print(f"第一个场馆示例: {venues[0]['name']}, ID: {venues[0]['venue_id']}")
        
        print("正在准备JSON响应...")
        response = jsonify(venues)
        print(f"JSON响应长度约: {len(str(venues))} 字符")
        print("======== 场馆API请求处理完成 ========\n")
        return response
    except Exception as e:
        print(f"处理场馆API请求时出错: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
            print("数据库游标已关闭")
        if conn:
            conn.close()
            print("数据库连接已关闭")

# API路由：根据ID获取场馆详情
@app.route('/api/venues/<int:venue_id>', methods=['GET'])
def get_venue_detail(venue_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # 获取场馆基本信息
        venue_query = "SELECT * FROM Venues WHERE venue_id = %s"
        cursor.execute(venue_query, (venue_id,))
        venue = cursor.fetchone()
        
        if not venue:
            return jsonify({"error": "场馆不存在"}), 404
        
        # 获取当前和即将举行的活动
        events_query = """
        SELECT * FROM Exhibitions_Events 
        WHERE venue_id = %s AND end_date >= CURDATE()
        ORDER BY start_date
        """
        cursor.execute(events_query, (venue_id,))
        events = cursor.fetchall()
        
        # 获取访问统计数据
        stats_query = """
        SELECT 
            COUNT(*) AS total_visits,
            COUNT(DISTINCT visitor_id) AS unique_visitors,
            AVG(satisfaction_rating) AS avg_satisfaction
        FROM Venue_Visits
        WHERE venue_id = %s AND satisfaction_rating IS NOT NULL
        """
        cursor.execute(stats_query, (venue_id,))
        stats = cursor.fetchone()
        
        result = {
            "venue": venue,
            "events": events,
            "statistics": stats
        }
        
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API路由：获取所有活动
@app.route('/api/events', methods=['GET'])
def get_events():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # 支持过滤参数
        venue_id = request.args.get('venue_id')
        event_type = request.args.get('type')
        upcoming = request.args.get('upcoming', 'false').lower() == 'true'
        
        query = """
        SELECT e.*, v.name AS venue_name
        FROM Exhibitions_Events e
        JOIN Venues v ON e.venue_id = v.venue_id
        WHERE 1=1
        """
        params = []
        
        if venue_id:
            query += " AND e.venue_id = %s"
            params.append(int(venue_id))
        
        if event_type:
            query += " AND e.type = %s"
            params.append(event_type)
        
        if upcoming:
            query += " AND e.end_date >= CURDATE()"
        
        query += " ORDER BY e.start_date DESC"
        
        cursor.execute(query, params)
        events = cursor.fetchall()
        return jsonify(events)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API路由：根据ID获取活动详情
@app.route('/api/events/<int:event_id>', methods=['GET'])
def get_event_detail(event_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # 获取活动基本信息
        event_query = """
        SELECT e.*, v.name AS venue_name, v.address AS venue_address
        FROM Exhibitions_Events e
        JOIN Venues v ON e.venue_id = v.venue_id
        WHERE e.event_id = %s
        """
        cursor.execute(event_query, (event_id,))
        event = cursor.fetchone()
        
        if not event:
            return jsonify({"error": "活动不存在"}), 404
        
        # 获取预约和参与统计
        stats_query = """
        SELECT 
            COUNT(*) AS total_reservations,
            SUM(CASE WHEN status = '已参加' THEN 1 ELSE 0 END) AS attended,
            SUM(CASE WHEN status = '已取消' THEN 1 ELSE 0 END) AS cancelled
        FROM Event_Reservations
        WHERE event_id = %s
        """
        cursor.execute(stats_query, (event_id,))
        reservation_stats = cursor.fetchone()
        
        # 获取访客满意度
        satisfaction_query = """
        SELECT AVG(satisfaction_rating) AS avg_satisfaction
        FROM Venue_Visits
        WHERE event_id = %s AND satisfaction_rating IS NOT NULL
        """
        cursor.execute(satisfaction_query, (event_id,))
        satisfaction = cursor.fetchone()
        
        result = {
            "event": event,
            "reservation_stats": reservation_stats,
            "satisfaction": satisfaction
        }
        
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API路由：预约活动
@app.route('/api/reservations', methods=['POST'])
@login_required
def create_reservation():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        data = request.json
        event_id = data.get('event_id')
        visitor_id = request.user.get('visitor_id')  # 从认证信息中获取用户ID
        
        if not event_id:
            return jsonify({"error": "缺少必要参数"}), 400
        
        # 检查活动是否存在
        cursor.execute("SELECT * FROM Exhibitions_Events WHERE event_id = %s", (event_id,))
        event = cursor.fetchone()
        
        if not event:
            return jsonify({"error": "活动不存在"}), 404
        
        # 检查活动是否可预约（状态为计划中或正在进行）
        if event['status'] not in ['计划中', '正在进行']:
            return jsonify({"error": f"活动当前状态为{event['status']}，无法预约"}), 400
            
        # 检查活动是否已过期
        current_date = datetime.now().date()
        if event['end_date'] < current_date:
            return jsonify({"error": "此活动已结束，无法预约"}), 400
        
        # 检查是否已经预约过
        cursor.execute(
            "SELECT * FROM Event_Reservations WHERE event_id = %s AND visitor_id = %s AND status != '已取消'",
            (event_id, visitor_id)
        )
        existing = cursor.fetchone()
        
        if existing:
            return jsonify({"error": "已经预约过该活动"}), 400
        
        # 创建预约
        cursor.execute(
            "INSERT INTO Event_Reservations (event_id, visitor_id, status) VALUES (%s, %s, '待审批')",
            (event_id, visitor_id)
        )
        
        conn.commit()
        return jsonify({"message": "预约成功", "reservation_id": cursor.lastrowid})
    except Exception as e:
        conn.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API路由：取消预约
@app.route('/api/reservations/<int:reservation_id>/cancel', methods=['PUT'])
@login_required
def cancel_reservation(reservation_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        visitor_id = request.user.get('visitor_id')  # 从认证信息中获取用户ID
        
        # 检查预约是否存在且属于当前用户
        cursor.execute(
            "SELECT * FROM Event_Reservations WHERE reservation_id = %s AND visitor_id = %s",
            (reservation_id, visitor_id)
        )
        reservation = cursor.fetchone()
        
        if not reservation:
            return jsonify({"error": "预约不存在或无权限取消"}), 404
            
        # 检查预约状态
        if reservation['status'] not in ['待审批', '已批准']:
            return jsonify({"error": f"当前预约状态为{reservation['status']}，无法取消"}), 400
        
        # 更新状态为已取消
        cursor.execute(
            "UPDATE Event_Reservations SET status = '已取消', updated_by = %s, updated_at = NOW() WHERE reservation_id = %s",
            (visitor_id, reservation_id)
        )
        
        conn.commit()
        return jsonify({"message": "预约已取消"})
    except Exception as e:
        conn.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API路由：添加访问记录和反馈
@app.route('/api/visits', methods=['POST'])
@login_required
def add_visit():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        data = request.json
        venue_id = data.get('venue_id')
        visitor_id = request.user.get('visitor_id')  # 从认证信息中获取用户ID
        event_id = data.get('event_id')
        satisfaction_rating = data.get('satisfaction_rating')
        feedback = data.get('feedback')
        
        if not venue_id:
            return jsonify({"error": "缺少必要参数"}), 400
        
        # 添加访问记录
        query = """
        INSERT INTO Venue_Visits 
        (venue_id, visitor_id, visit_date, visit_time, event_id, satisfaction_rating, feedback)
        VALUES (%s, %s, CURDATE(), CURTIME(), %s, %s, %s)
        """
        
        cursor.execute(query, (venue_id, visitor_id, event_id, satisfaction_rating, feedback))
        
        # 如果有活动ID，更新预约状态
        if event_id:
            cursor.execute(
                """
                UPDATE Event_Reservations 
                SET status = '已参加', updated_by = %s, updated_at = NOW()
                WHERE event_id = %s AND visitor_id = %s AND status = '已预约'
                """,
                (visitor_id, event_id, visitor_id)
            )
        
        conn.commit()
        return jsonify({"message": "访问记录已添加", "visit_id": cursor.lastrowid})
    except Exception as e:
        conn.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API路由：获取访客预约列表
@app.route('/api/visitor/reservations', methods=['GET'])
@login_required
def get_visitor_reservations():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        visitor_id = request.user.get('visitor_id')
        
        # 获取预约信息
        query = """
        SELECT 
            r.reservation_id,
            r.event_id,
            r.status,
            r.reservation_date,
            r.notes,
            e.name AS event_name,
            e.start_date,
            e.end_date,
            e.description,
            e.type AS event_type,
            v.name AS venue_name,
            v.venue_id,
            v.address AS venue_address,
            manager.username AS updated_by_name
        FROM Event_Reservations r
        JOIN Exhibitions_Events e ON r.event_id = e.event_id
        JOIN Venues v ON e.venue_id = v.venue_id
        LEFT JOIN Visitors manager ON r.updated_by = manager.visitor_id
        WHERE r.visitor_id = %s
        ORDER BY e.start_date DESC
        """
        cursor.execute(query, (visitor_id,))
        reservations = cursor.fetchall()
        
        return jsonify(reservations)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API路由：获取访客访问记录
@app.route('/api/visitor/visits', methods=['GET'])
@login_required
def get_visitor_visits():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        visitor_id = request.user.get('visitor_id')
        
        # 获取访问记录
        query = """
        SELECT 
            vv.visit_id,
            vv.visit_date,
            vv.visit_time,
            vv.satisfaction_rating,
            vv.feedback,
            v.venue_id,
            v.name AS venue_name,
            v.type AS venue_type,
            e.event_id,
            e.name AS event_name,
            e.type AS event_type
        FROM Venue_Visits vv
        JOIN Venues v ON vv.venue_id = v.venue_id
        LEFT JOIN Exhibitions_Events e ON vv.event_id = e.event_id
        WHERE vv.visitor_id = %s
        ORDER BY vv.visit_date DESC, vv.visit_time DESC
        """
        cursor.execute(query, (visitor_id,))
        visits = cursor.fetchall()
        
        return jsonify(visits)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API路由：注册访客
@app.route('/api/visitors', methods=['POST'])
def register_visitor():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        age_group = data.get('age_group')
        occupation_type = data.get('occupation_type')
        gender = data.get('gender')
        education_level = data.get('education_level')
        email = data.get('email')
        phone = data.get('phone')
        
        if not all([username, password, age_group, occupation_type, gender, education_level]):
            return jsonify({"error": "缺少必要参数 (用户名, 密码, 年龄段, 职业, 性别, 教育水平)"}), 400
        
        # 检查用户名是否已存在
        cursor.execute("SELECT visitor_id FROM Visitors WHERE username = %s", (username,))
        existing_user = cursor.fetchone()
        if existing_user:
            return jsonify({"error": "用户名已存在"}), 409 # Conflict

        # 检查邮箱是否已存在
        if email:
            cursor.execute("SELECT visitor_id FROM Visitors WHERE email = %s", (email,))
            existing_email = cursor.fetchone()
            if existing_email:
                return jsonify({"error": "邮箱已被注册"}), 409 # Conflict

        # 哈希密码
        hashed_password = generate_password_hash(password)

        query = """
        INSERT INTO Visitors (username, password, role, age_group, occupation_type, gender, education_level, email, phone)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        cursor.execute(query, (username, hashed_password, 'user', age_group, occupation_type, gender, education_level, email, phone))
        visitor_id = cursor.lastrowid
        conn.commit()
        
        # 创建会话
        session_id = str(uuid.uuid4())
        expires_at = datetime.now() + timedelta(days=7)  # 7天后过期
        
        cursor.execute(
            "INSERT INTO Sessions (session_id, visitor_id, expires_at) VALUES (%s, %s, %s)",
            (session_id, visitor_id, expires_at)
        )
        conn.commit()
        
        return jsonify({
            "message": "访客注册成功", 
            "visitor_id": visitor_id,
            "username": username,
            "token": session_id,
            "role": "user"
        }), 201 # Created
    except Exception as e:
        conn.rollback()
        # 打印详细错误信息到控制台，方便调试
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# API路由：根据ID获取访客详情
@app.route('/api/visitors/<int:visitor_id>', methods=['GET'])
@login_required
def get_visitor_detail(visitor_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        current_user_id = request.user.get('visitor_id')
        role = request.user.get('role')
        
        # 非管理员只能查看自己的信息
        if role not in ['admin', 'venue_manager'] and current_user_id != visitor_id:
            return jsonify({"error": "无权限查看他人信息"}), 403
        
        # 获取访客基本信息
        visitor_query = """
        SELECT visitor_id, username, role, age_group, occupation_type, gender, 
        education_level, email, phone, managed_venue_id, registration_date
        FROM Visitors WHERE visitor_id = %s
        """
        cursor.execute(visitor_query, (visitor_id,))
        visitor = cursor.fetchone()
        
        if not visitor:
            return jsonify({"error": "访客不存在"}), 404
        
        # 获取访问统计数据
        stats_query = """
        SELECT 
            COUNT(*) AS total_visits,
            COUNT(DISTINCT venue_id) AS venues_visited,
            AVG(satisfaction_rating) AS avg_satisfaction
        FROM Venue_Visits
        WHERE visitor_id = %s
        """
        cursor.execute(stats_query, (visitor_id,))
        stats = cursor.fetchone()
        
        # 获取预约信息
        reservations_query = """
        SELECT 
            r.reservation_id,
            r.event_id,
            r.status,
            e.name AS event_name,
            e.start_date,
            e.end_date,
            v.name AS venue_name
        FROM Event_Reservations r
        JOIN Exhibitions_Events e ON r.event_id = e.event_id
        JOIN Venues v ON e.venue_id = v.venue_id
        WHERE r.visitor_id = %s
        ORDER BY e.start_date DESC
        LIMIT 5
        """
        cursor.execute(reservations_query, (visitor_id,))
        reservations = cursor.fetchall()
        
        # 如果是场馆管理员，获取管理的场馆信息
        if visitor['role'] == 'venue_manager' and visitor['managed_venue_id']:
            cursor.execute("SELECT * FROM Venues WHERE venue_id = %s", (visitor['managed_venue_id'],))
            managed_venue = cursor.fetchone()
            visitor['managed_venue'] = managed_venue
        
        result = {
            "visitor": visitor,
            "statistics": stats,
            "recent_reservations": reservations
        }
        
        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API路由：访客流量趋势分析
@app.route('/api/analytics/visitor_trends', methods=['GET'])
def visitor_trends():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        venue_id = request.args.get('venue_id')
        period = request.args.get('period', 'monthly')  # monthly, weekly, daily
        
        if period == 'monthly':
            time_format = '%Y-%m'
            group_by = "DATE_FORMAT(vv.visit_date, '%Y-%m')"
        elif period == 'weekly':
            time_format = '%Y-%u'
            group_by = "DATE_FORMAT(vv.visit_date, '%Y-%u')"
        else:  # daily
            time_format = '%Y-%m-%d'
            group_by = "vv.visit_date"
        
        query = f"""
        SELECT 
            {group_by} AS time_period,
            COUNT(*) AS visitor_count
        FROM 
            Venue_Visits vv
        """
        
        params = []
        if venue_id:
            query += " WHERE vv.venue_id = %s"
            params.append(int(venue_id))
        
        query += f"""
        GROUP BY 
            time_period
        ORDER BY 
            time_period
        """
        
        cursor.execute(query, params)
        trends = cursor.fetchall()
        return jsonify(trends)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API路由：不同类型展览/活动的受欢迎程度
@app.route('/api/analytics/event_popularity', methods=['GET'])
def event_popularity():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # 这个查询处理有event_id的访问记录
        query = """
        SELECT 
            ee.type AS event_type,
            COUNT(DISTINCT vv.visitor_id) AS unique_visitors,
            AVG(vv.satisfaction_rating) AS avg_satisfaction
        FROM 
            Venue_Visits vv
        JOIN 
            Exhibitions_Events ee ON vv.event_id = ee.event_id
        WHERE
            vv.event_id IS NOT NULL
        GROUP BY 
            ee.type
        ORDER BY 
            unique_visitors DESC
        """
        
        cursor.execute(query)
        popularity = cursor.fetchall()
        
        # 如果没有数据，尝试获取所有活动类型
        if not popularity:
            query = """
            SELECT 
                type AS event_type,
                0 AS unique_visitors,
                NULL AS avg_satisfaction
            FROM 
                Exhibitions_Events
            GROUP BY 
                type
            """
            cursor.execute(query)
            popularity = cursor.fetchall()
        
        return jsonify(popularity)
    except Exception as e:
        print(f"事件受欢迎程度API错误: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API路由：访客画像分析
@app.route('/api/analytics/visitor_profiles', methods=['GET'])
def visitor_profiles():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        dimension = request.args.get('dimension', 'age_group')  # age_group, occupation_type, gender, education_level, venue_type
        venue_type = request.args.get('venue_type')
        
        # 场馆类型分布的特殊处理
        if dimension == 'venue_type':
            query = """
            SELECT 
                v.type,
                COUNT(DISTINCT vv.visitor_id) AS unique_visitors,
                COUNT(*) AS total_visits
            FROM 
                Venue_Visits vv
            JOIN 
                Venues v ON vv.venue_id = v.venue_id
            GROUP BY 
                v.type
            ORDER BY 
                total_visits DESC
            """
            cursor.execute(query)
            profiles = cursor.fetchall()
            return jsonify(profiles)
        
        # 职业和场馆类型组合的特殊处理
        elif dimension == 'occupation_venue_type':
            query = """
            SELECT 
                vis.occupation_type,
                v.type AS venue_type,
                COUNT(*) AS total_visits
            FROM 
                Venue_Visits vv
            JOIN 
                Visitors vis ON vv.visitor_id = vis.visitor_id
            JOIN 
                Venues v ON vv.venue_id = v.venue_id
            GROUP BY 
                vis.occupation_type, v.type
            ORDER BY 
                vis.occupation_type, total_visits DESC
            """
            cursor.execute(query)
            profiles = cursor.fetchall()
            return jsonify(profiles)
        
        # 标准维度分析
        else:
            query = f"""
            SELECT 
                vis.{dimension},
                COUNT(DISTINCT vv.visitor_id) AS unique_visitors,
                COUNT(*) AS total_visits
            FROM 
                Venue_Visits vv
            JOIN 
                Visitors vis ON vv.visitor_id = vis.visitor_id
            JOIN 
                Venues v ON vv.venue_id = v.venue_id
            """
            
            params = []
            if venue_type:
                query += " WHERE v.type = %s"
                params.append(venue_type)
            
            query += f"""
            GROUP BY 
                vis.{dimension}
            ORDER BY 
                total_visits DESC
            """
            
            cursor.execute(query, params)
            profiles = cursor.fetchall()
            return jsonify(profiles)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API路由：最受欢迎的展览/活动TOP10
@app.route('/api/analytics/top_events', methods=['GET'])
def top_events():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # 首先尝试获取有访问记录的活动
        query = """
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
        WHERE
            vv.event_id IS NOT NULL
        GROUP BY 
            ee.event_id
        ORDER BY 
            visitor_count DESC, avg_satisfaction DESC
        LIMIT 10
        """
        
        cursor.execute(query)
        top_events = cursor.fetchall()
        
        # 如果没有访问记录，获取所有活动
        if not top_events:
            query = """
            SELECT 
                ee.name AS event_name,
                v.name AS venue_name,
                ee.type AS event_type,
                0 AS visitor_count,
                NULL AS avg_satisfaction
            FROM 
                Exhibitions_Events ee
            JOIN 
                Venues v ON ee.venue_id = v.venue_id
            ORDER BY 
                ee.name
            LIMIT 10
            """
            cursor.execute(query)
            top_events = cursor.fetchall()
        
        print(f"返回了 {len(top_events)} 条TOP活动数据")
        return jsonify(top_events)
    except Exception as e:
        print(f"TOP活动API错误: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API路由：访问时间分布分析
@app.route('/api/analytics/visit_time_distribution', methods=['GET'])
def visit_time_distribution():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        distribution_type = request.args.get('type', 'hourly')  # hourly, weekly
        
        if distribution_type == 'hourly':
            query = """
            SELECT 
                HOUR(vv.visit_time) AS hour,
                COUNT(*) AS visit_count
            FROM 
                Venue_Visits vv
            GROUP BY 
                hour
            ORDER BY 
                hour
            """
        else:  # weekly
            query = """
            SELECT 
                DAYOFWEEK(vv.visit_date) AS day_of_week,
                CASE 
                    WHEN DAYOFWEEK(vv.visit_date) = 1 THEN '周日'
                    WHEN DAYOFWEEK(vv.visit_date) = 2 THEN '周一'
                    WHEN DAYOFWEEK(vv.visit_date) = 3 THEN '周二'
                    WHEN DAYOFWEEK(vv.visit_date) = 4 THEN '周三'
                    WHEN DAYOFWEEK(vv.visit_date) = 5 THEN '周四'
                    WHEN DAYOFWEEK(vv.visit_date) = 6 THEN '周五'
                    WHEN DAYOFWEEK(vv.visit_date) = 7 THEN '周六'
                END AS day_name,
                COUNT(*) AS visit_count
            FROM 
                Venue_Visits vv
            GROUP BY 
                day_of_week, day_name
            ORDER BY 
                day_of_week
            """
        
        cursor.execute(query)
        distribution = cursor.fetchall()
        return jsonify(distribution)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API路由：搜索场馆和活动
@app.route('/api/search', methods=['GET'])
def search():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        keyword = request.args.get('keyword', '')
        
        if not keyword:
            return jsonify([])
        
        # 搜索场馆
        venues_query = """
        SELECT 
            'venue' AS type,
            venue_id AS id,
            name,
            type AS category,
            address,
            opening_hours
        FROM 
            Venues
        WHERE 
            name LIKE %s OR 
            introduction LIKE %s OR
            address LIKE %s
        """
        
        # 搜索活动
        events_query = """
        SELECT 
            'event' AS type,
            e.event_id AS id,
            e.name,
            e.type AS category,
            v.name AS venue_name,
            e.start_date,
            e.end_date
        FROM 
            Exhibitions_Events e
        JOIN 
            Venues v ON e.venue_id = v.venue_id
        WHERE 
            e.name LIKE %s OR 
            e.description LIKE %s
        """
        
        search_param = f'%{keyword}%'
        
        cursor.execute(venues_query, (search_param, search_param, search_param))
        venues_results = cursor.fetchall()
        
        cursor.execute(events_query, (search_param, search_param))
        events_results = cursor.fetchall()
        
        # 合并结果
        results = venues_results + events_results
        
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# API路由：用户登录
@app.route('/api/login', methods=['POST'])
def login_user():
    conn = None
    cursor = None
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({"error": "缺少用户名或密码"}), 400

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # 根据用户名查找用户
        query = "SELECT visitor_id, username, password, role FROM Visitors WHERE username = %s"
        cursor.execute(query, (username,))
        user = cursor.fetchone()

        if not user:
            return jsonify({"error": "无效的用户名或密码"}), 401

        # 尝试两种密码验证方法
        is_password_valid = False
        
        # 1. 先尝试werkzeug的password_hash验证
        try:
            is_password_valid = check_password_hash(user['password'], password)
        except Exception:
            # 如果werkzeug验证失败，可能是因为密码不是werkzeug格式
            pass
            
        # 2. 如果werkzeug验证失败，尝试MD5验证
        if not is_password_valid:
            import hashlib
            md5_hash = hashlib.md5(password.encode()).hexdigest()
            is_password_valid = (md5_hash == user['password'])
        
        if is_password_valid:
            # 创建新的会话
            session_id = str(uuid.uuid4())
            expires_at = datetime.now() + timedelta(days=7)  # 7天后过期
            
            cursor.execute(
                "INSERT INTO Sessions (session_id, visitor_id, expires_at) VALUES (%s, %s, %s)",
                (session_id, user['visitor_id'], expires_at)
            )
            conn.commit()
            
            # 登录成功，返回用户基本信息和token
            return jsonify({
                "message": "登录成功",
                "visitor_id": user['visitor_id'],
                "username": user['username'],
                "role": user['role'],
                "token": session_id
            }), 200
        else:
            # 密码错误
            return jsonify({"error": "无效的用户名或密码"}), 401 # Unauthorized

    except Exception as e:
        # 打印详细错误信息到控制台，方便调试
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# API路由：退出登录
@app.route('/api/logout', methods=['POST'])
@login_required
def logout_user():
    conn = None
    cursor = None
    try:
        auth_token = request.headers.get('Authorization')
        session_id = auth_token.split(' ')[1]

        conn = get_db_connection()
        cursor = conn.cursor()

        # 立即使会话过期
        cursor.execute("UPDATE Sessions SET expires_at = NOW() WHERE session_id = %s", (session_id,))
        conn.commit()

        return jsonify({"message": "已成功退出登录"}), 200

    except Exception as e:
        conn.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# API路由：获取当前用户信息
@app.route('/api/current_user', methods=['GET'])
@login_required
def get_current_user():
    conn = None
    cursor = None
    try:
        visitor_id = request.user.get('visitor_id')
        
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # 获取用户详细信息
        query = """
        SELECT 
            visitor_id, username, role, age_group, occupation_type, 
            gender, education_level, email, phone, managed_venue_id 
        FROM Visitors 
        WHERE visitor_id = %s
        """
        cursor.execute(query, (visitor_id,))
        user = cursor.fetchone()
        
        if not user:
            return jsonify({"error": "用户不存在"}), 404
            
        # 如果是场馆管理员，获取场馆信息
        if user['role'] == 'venue_manager' and user['managed_venue_id']:
            cursor.execute("SELECT * FROM Venues WHERE venue_id = %s", (user['managed_venue_id'],))
            venue = cursor.fetchone()
            user['managed_venue'] = venue
            
        return jsonify(user), 200
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# API路由：管理员获取所有预约
@app.route('/api/admin/reservations', methods=['GET'])
@admin_required
def admin_get_all_reservations():
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        visitor_id = request.user.get('visitor_id')
        role = request.user.get('role')

        # 构建查询
        query = """
        SELECT 
            r.reservation_id,
            r.reservation_date,
            r.status,
            r.notes,
            e.event_id,
            e.name AS event_name,
            e.start_date,
            e.end_date,
            v.visitor_id,
            v.username AS visitor_username,
            v.age_group,
            v.occupation_type,
            v.email,
            v.phone,
            venue.venue_id,
            venue.name AS venue_name
        FROM Event_Reservations r
        JOIN Exhibitions_Events e ON r.event_id = e.event_id
        JOIN Visitors v ON r.visitor_id = v.visitor_id
        JOIN Venues venue ON e.venue_id = venue.venue_id
        """
        
        params = []
        
        # 如果是场馆管理员，只能看到自己管理的场馆的预约
        if role == 'venue_manager':
            query += " JOIN Visitors manager ON manager.visitor_id = %s AND manager.managed_venue_id = venue.venue_id"
            params.append(visitor_id)
        
        # 添加排序
        query += " ORDER BY r.reservation_date DESC"
        
        cursor.execute(query, params)
        reservations = cursor.fetchall()

        return jsonify(reservations), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# API路由：管理员修改预约状态
@app.route('/api/admin/reservations/<int:reservation_id>', methods=['PUT'])
@admin_required
def admin_update_reservation_status(reservation_id):
    conn = None
    cursor = None
    try:
        data = request.json
        new_status = data.get('status')
        notes = data.get('notes')
        visitor_id = request.user.get('visitor_id')
        role = request.user.get('role')

        if not new_status:
            return jsonify({"error": "缺少新的预约状态"}), 400
            
        # 检查新的状态值是否有效 (与数据库ENUM匹配)
        valid_statuses = ['待审批', '已批准', '已参加', '已取消', '已拒绝']
        if new_status not in valid_statuses:
             return jsonify({"error": f"无效的预约状态: {new_status}. 状态必须是以下之一: {', '.join(valid_statuses)}"}), 400

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # 检查预约是否存在
        cursor.execute("SELECT * FROM Event_Reservations WHERE reservation_id = %s", (reservation_id,))
        reservation = cursor.fetchone()
        if not reservation:
            return jsonify({"error": "预约不存在"}), 404
            
        # 如果是场馆管理员，验证是否有权限修改此预约
        if role == 'venue_manager':
            query = """
            SELECT COUNT(*) AS count FROM Event_Reservations r
            JOIN Exhibitions_Events e ON r.event_id = e.event_id
            JOIN Venues v ON e.venue_id = v.venue_id
            JOIN Visitors manager ON manager.visitor_id = %s AND manager.managed_venue_id = v.venue_id
            WHERE r.reservation_id = %s
            """
            cursor.execute(query, (visitor_id, reservation_id))
            result = cursor.fetchone()
            
            if result['count'] == 0:
                return jsonify({"error": "无权限修改此预约"}), 403

        # 更新预约状态
        query = "UPDATE Event_Reservations SET status = %s, notes = %s, updated_by = %s, updated_at = NOW() WHERE reservation_id = %s"
        cursor.execute(query, (new_status, notes, visitor_id, reservation_id))
        conn.commit()

        return jsonify({"message": f"预约 {reservation_id} 状态已更新为 {new_status}"}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            
# API路由：管理员获取场馆活动列表
@app.route('/api/admin/events', methods=['GET'])
@admin_required
def admin_get_events():
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        visitor_id = request.user.get('visitor_id')
        role = request.user.get('role')
        
        # 可选过滤参数
        venue_id = request.args.get('venue_id')
        status = request.args.get('status')
        
        # 构建查询
        query = """
        SELECT 
            e.*,
            v.name AS venue_name,
            creator.username AS created_by_username,
            (SELECT COUNT(*) FROM Event_Reservations r WHERE r.event_id = e.event_id) AS reservation_count
        FROM Exhibitions_Events e
        JOIN Venues v ON e.venue_id = v.venue_id
        LEFT JOIN Visitors creator ON e.created_by = creator.visitor_id
        """
        
        params = []
        where_clauses = []
        
        # 如果是场馆管理员，只能看到自己管理的场馆
        if role == 'venue_manager':
            where_clauses.append("EXISTS (SELECT 1 FROM Visitors manager WHERE manager.visitor_id = %s AND manager.managed_venue_id = e.venue_id)")
            params.append(visitor_id)
        
        # 添加其他过滤条件
        if venue_id:
            where_clauses.append("e.venue_id = %s")
            params.append(venue_id)
            
        if status:
            where_clauses.append("e.status = %s")
            params.append(status)
            
        # 组装WHERE子句
        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)
            
        # 添加排序
        query += " ORDER BY e.start_date DESC"
        
        cursor.execute(query, params)
        events = cursor.fetchall()
        
        return jsonify(events), 200
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            
# API路由：管理员创建新活动
@app.route('/api/admin/events', methods=['POST'])
@admin_required
def admin_create_event():
    conn = None
    cursor = None
    try:
        data = request.json
        venue_id = data.get('venue_id')
        name = data.get('name')
        event_type = data.get('type')
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        description = data.get('description')
        capacity = data.get('capacity')
        ticket_required = data.get('ticket_required', False)
        status = data.get('status', '计划中')
        
        visitor_id = request.user.get('visitor_id')
        role = request.user.get('role')
        
        # 验证必要参数
        if not all([venue_id, name, event_type, start_date, end_date]):
            return jsonify({"error": "缺少必要参数"}), 400
            
        # 如果是场馆管理员，验证是否有权限在该场馆创建活动
        if role == 'venue_manager':
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            
            cursor.execute("SELECT managed_venue_id FROM Visitors WHERE visitor_id = %s", (visitor_id,))
            manager = cursor.fetchone()
            
            if not manager or manager['managed_venue_id'] != int(venue_id):
                return jsonify({"error": "无权限在此场馆创建活动"}), 403
                
        # 创建新活动
        query = """
        INSERT INTO Exhibitions_Events 
        (venue_id, name, type, start_date, end_date, description, capacity, ticket_required, status, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        cursor.execute(query, (
            venue_id, name, event_type, start_date, end_date, 
            description, capacity, ticket_required, status, visitor_id
        ))
        
        event_id = cursor.lastrowid
        conn.commit()
        
        return jsonify({
            "message": "活动创建成功",
            "event_id": event_id
        }), 201
        
    except Exception as e:
        if conn:
            conn.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            
# API路由：管理员更新活动信息
@app.route('/api/admin/events/<int:event_id>', methods=['PUT'])
@admin_required
def admin_update_event(event_id):
    conn = None
    cursor = None
    try:
        data = request.json
        name = data.get('name')
        event_type = data.get('type')
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        description = data.get('description')
        capacity = data.get('capacity')
        ticket_required = data.get('ticket_required')
        status = data.get('status')
        
        visitor_id = request.user.get('visitor_id')
        role = request.user.get('role')
        
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # 检查活动是否存在
        cursor.execute("SELECT * FROM Exhibitions_Events WHERE event_id = %s", (event_id,))
        event = cursor.fetchone()
        
        if not event:
            return jsonify({"error": "活动不存在"}), 404
            
        # 如果是场馆管理员，验证是否有权限修改此活动
        if role == 'venue_manager':
            query = """
            SELECT COUNT(*) AS count FROM Exhibitions_Events e
            JOIN Visitors v ON v.visitor_id = %s AND v.managed_venue_id = e.venue_id
            WHERE e.event_id = %s
            """
            cursor.execute(query, (visitor_id, event_id))
            result = cursor.fetchone()
            
            if result['count'] == 0:
                return jsonify({"error": "无权限修改此活动"}), 403
                
        # 构建更新查询
        update_fields = []
        update_values = []
        
        if name:
            update_fields.append("name = %s")
            update_values.append(name)
            
        if event_type:
            update_fields.append("type = %s")
            update_values.append(event_type)
            
        if start_date:
            update_fields.append("start_date = %s")
            update_values.append(start_date)
            
        if end_date:
            update_fields.append("end_date = %s")
            update_values.append(end_date)
            
        if description is not None:
            update_fields.append("description = %s")
            update_values.append(description)
            
        if capacity is not None:
            update_fields.append("capacity = %s")
            update_values.append(capacity)
            
        if ticket_required is not None:
            update_fields.append("ticket_required = %s")
            update_values.append(ticket_required)
            
        if status:
            update_fields.append("status = %s")
            update_values.append(status)
            
        if not update_fields:
            return jsonify({"error": "未提供需要更新的字段"}), 400
            
        # 添加最后更新时间
        update_fields.append("updated_at = NOW()")
        
        # 构建完整的更新查询
        query = f"UPDATE Exhibitions_Events SET {', '.join(update_fields)} WHERE event_id = %s"
        update_values.append(event_id)
        
        cursor.execute(query, update_values)
        conn.commit()
        
        return jsonify({"message": f"活动 {event_id} 已成功更新"}), 200
        
    except Exception as e:
        if conn:
            conn.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# API路由：管理员获取所有用户
@app.route('/api/admin/visitors', methods=['GET'])
@admin_required
def admin_get_visitors():
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        role_filter = request.args.get('role')
        
        query = """
        SELECT 
            visitor_id, username, role, age_group, occupation_type, gender, 
            education_level, email, phone, managed_venue_id, registration_date
        FROM Visitors
        """
        
        params = []
        if role_filter:
            query += " WHERE role = %s"
            params.append(role_filter)
            
        query += " ORDER BY registration_date DESC"
        
        cursor.execute(query, params)
        visitors = cursor.fetchall()
        
        # 对于场馆管理员，添加他们管理的场馆信息
        for visitor in visitors:
            if visitor['role'] == 'venue_manager' and visitor['managed_venue_id']:
                cursor.execute("SELECT venue_id, name, type, address FROM Venues WHERE venue_id = %s", (visitor['managed_venue_id'],))
                venue = cursor.fetchone()
                visitor['managed_venue'] = venue
        
        return jsonify(visitors), 200
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# API路由：管理员创建用户
@app.route('/api/admin/visitors', methods=['POST'])
@admin_required
def admin_create_visitor():
    conn = None
    cursor = None
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        role = data.get('role', 'user')
        age_group = data.get('age_group')
        occupation_type = data.get('occupation_type')
        gender = data.get('gender')
        education_level = data.get('education_level')
        email = data.get('email')
        phone = data.get('phone')
        managed_venue_id = data.get('managed_venue_id')
        
        # 验证必要参数
        if not all([username, password, role, age_group, occupation_type, gender, education_level]):
            return jsonify({"error": "缺少必要参数"}), 400
            
        # 检查用户名和邮箱是否已存在
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT visitor_id FROM Visitors WHERE username = %s", (username,))
        if cursor.fetchone():
            return jsonify({"error": "用户名已存在"}), 409
            
        if email:
            cursor.execute("SELECT visitor_id FROM Visitors WHERE email = %s", (email,))
            if cursor.fetchone():
                return jsonify({"error": "邮箱已被注册"}), 409
                
        # 如果是场馆管理员，验证场馆是否存在
        if role == 'venue_manager' and managed_venue_id:
            cursor.execute("SELECT venue_id FROM Venues WHERE venue_id = %s", (managed_venue_id,))
            if not cursor.fetchone():
                return jsonify({"error": "指定的场馆不存在"}), 404
                
        # 哈希密码
        hashed_password = generate_password_hash(password)
        
        # 创建用户
        query = """
        INSERT INTO Visitors 
        (username, password, role, age_group, occupation_type, gender, education_level, email, phone, managed_venue_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        cursor.execute(query, (
            username, hashed_password, role, age_group, occupation_type, 
            gender, education_level, email, phone, managed_venue_id
        ))
        
        visitor_id = cursor.lastrowid
        conn.commit()
        
        return jsonify({
            "message": "用户创建成功",
            "visitor_id": visitor_id
        }), 201
        
    except Exception as e:
        if conn:
            conn.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# API路由：管理员更新用户信息
@app.route('/api/admin/visitors/<int:visitor_id>', methods=['PUT'])
@admin_required
def admin_update_visitor(visitor_id):
    conn = None
    cursor = None
    try:
        data = request.json
        role = data.get('role')
        age_group = data.get('age_group')
        occupation_type = data.get('occupation_type')
        gender = data.get('gender')
        education_level = data.get('education_level')
        email = data.get('email')
        phone = data.get('phone')
        managed_venue_id = data.get('managed_venue_id')
        password = data.get('password')  # 可选，如果要更改密码
        
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # 检查用户是否存在
        cursor.execute("SELECT * FROM Visitors WHERE visitor_id = %s", (visitor_id,))
        visitor = cursor.fetchone()
        
        if not visitor:
            return jsonify({"error": "用户不存在"}), 404
            
        # 构建更新查询
        update_fields = []
        update_values = []
        
        if role:
            update_fields.append("role = %s")
            update_values.append(role)
            
        if age_group:
            update_fields.append("age_group = %s")
            update_values.append(age_group)
            
        if occupation_type:
            update_fields.append("occupation_type = %s")
            update_values.append(occupation_type)
            
        if gender:
            update_fields.append("gender = %s")
            update_values.append(gender)
            
        if education_level:
            update_fields.append("education_level = %s")
            update_values.append(education_level)
            
        if email is not None:
            # 检查邮箱是否已被其他用户使用
            if email:
                cursor.execute("SELECT visitor_id FROM Visitors WHERE email = %s AND visitor_id != %s", (email, visitor_id))
                if cursor.fetchone():
                    return jsonify({"error": "邮箱已被其他用户注册"}), 409
            update_fields.append("email = %s")
            update_values.append(email)
            
        if phone is not None:
            update_fields.append("phone = %s")
            update_values.append(phone)
            
        if managed_venue_id is not None:
            # 如果指定了场馆ID，检查场馆是否存在
            if managed_venue_id:
                cursor.execute("SELECT venue_id FROM Venues WHERE venue_id = %s", (managed_venue_id,))
                if not cursor.fetchone():
                    return jsonify({"error": "指定的场馆不存在"}), 404
            update_fields.append("managed_venue_id = %s")
            update_values.append(managed_venue_id)
            
        if password:
            # 更新密码
            hashed_password = generate_password_hash(password)
            update_fields.append("password = %s")
            update_values.append(hashed_password)
            
        if not update_fields:
            return jsonify({"error": "未提供需要更新的字段"}), 400
            
        # 构建完整的更新查询
        query = f"UPDATE Visitors SET {', '.join(update_fields)} WHERE visitor_id = %s"
        update_values.append(visitor_id)
        
        cursor.execute(query, update_values)
        conn.commit()
        
        return jsonify({"message": f"用户 {visitor_id} 信息已成功更新"}), 200
        
    except Exception as e:
        if conn:
            conn.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# API路由：更新用户个人信息
@app.route('/api/profile', methods=['PUT'])
@login_required
def update_profile():
    conn = None
    cursor = None
    try:
        data = request.json
        visitor_id = request.user.get('visitor_id')
        
        # 可更新的字段
        age_group = data.get('age_group')
        occupation_type = data.get('occupation_type')
        gender = data.get('gender')
        education_level = data.get('education_level')
        email = data.get('email')
        phone = data.get('phone')
        current_password = data.get('current_password')
        new_password = data.get('new_password')
        
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # 构建更新查询
        update_fields = []
        update_values = []
        
        # 如果要更新密码，先验证当前密码
        if current_password and new_password:
            cursor.execute("SELECT password FROM Visitors WHERE visitor_id = %s", (visitor_id,))
            user = cursor.fetchone()
            
            if not user or not check_password_hash(user['password'], current_password):
                return jsonify({"error": "当前密码不正确"}), 400
                
            # 更新密码
            hashed_password = generate_password_hash(new_password)
            update_fields.append("password = %s")
            update_values.append(hashed_password)
        
        if age_group:
            update_fields.append("age_group = %s")
            update_values.append(age_group)
            
        if occupation_type:
            update_fields.append("occupation_type = %s")
            update_values.append(occupation_type)
            
        if gender:
            update_fields.append("gender = %s")
            update_values.append(gender)
            
        if education_level:
            update_fields.append("education_level = %s")
            update_values.append(education_level)
            
        if email is not None:
            # 检查邮箱是否已被其他用户使用
            if email:
                cursor.execute("SELECT visitor_id FROM Visitors WHERE email = %s AND visitor_id != %s", (email, visitor_id))
                if cursor.fetchone():
                    return jsonify({"error": "邮箱已被其他用户注册"}), 409
            update_fields.append("email = %s")
            update_values.append(email)
            
        if phone is not None:
            update_fields.append("phone = %s")
            update_values.append(phone)
            
        if not update_fields:
            return jsonify({"error": "未提供需要更新的字段"}), 400
            
        # 构建完整的更新查询
        query = f"UPDATE Visitors SET {', '.join(update_fields)} WHERE visitor_id = %s"
        update_values.append(visitor_id)
        
        cursor.execute(query, update_values)
        conn.commit()
        
        return jsonify({"message": "个人信息已成功更新"}), 200
        
    except Exception as e:
        if conn:
            conn.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# API路由：管理员获取特定用户的详细信息
@app.route('/api/admin/visitors/<int:visitor_id>', methods=['GET'])
@admin_required
def admin_get_visitor_detail(visitor_id):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # 获取访客基本信息
        visitor_query = """
        SELECT visitor_id, username, role, age_group, occupation_type, gender, 
        education_level, email, phone, managed_venue_id, registration_date
        FROM Visitors WHERE visitor_id = %s
        """
        cursor.execute(visitor_query, (visitor_id,))
        visitor = cursor.fetchone()
        
        if not visitor:
            return jsonify({"error": "用户不存在"}), 404
        
        # 获取访问统计数据
        stats_query = """
        SELECT 
            COUNT(*) AS total_visits,
            COUNT(DISTINCT venue_id) AS venues_visited,
            AVG(satisfaction_rating) AS avg_satisfaction
        FROM Venue_Visits
        WHERE visitor_id = %s
        """
        cursor.execute(stats_query, (visitor_id,))
        stats = cursor.fetchone()
        
        # 获取预约信息
        reservations_query = """
        SELECT 
            r.reservation_id,
            r.event_id,
            r.status,
            e.name AS event_name,
            e.start_date,
            e.end_date,
            v.name AS venue_name
        FROM Event_Reservations r
        JOIN Exhibitions_Events e ON r.event_id = e.event_id
        JOIN Venues v ON e.venue_id = v.venue_id
        WHERE r.visitor_id = %s
        ORDER BY e.start_date DESC
        LIMIT 5
        """
        cursor.execute(reservations_query, (visitor_id,))
        reservations = cursor.fetchall()
        
        # 如果是场馆管理员，获取管理的场馆信息
        if visitor['role'] == 'venue_manager' and visitor['managed_venue_id']:
            cursor.execute("SELECT * FROM Venues WHERE venue_id = %s", (visitor['managed_venue_id'],))
            managed_venue = cursor.fetchone()
            visitor['managed_venue'] = managed_venue
        
        result = {
            "visitor": visitor,
            "statistics": stats,
            "recent_reservations": reservations
        }
        
        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

if __name__ == '__main__':
    app.run(debug=True) 