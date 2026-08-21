import {
    Context, Handler, param, PRIV, Types, UserModel, DomainModel,
    ValidationError, UserNotFoundError, PermissionError, Time, SystemModel, moment
} from 'hydrooj';

declare module 'hydrooj' {
    interface Collections {
        // 扩展用户集合类型
    }
}

// 用户管理处理器基类
class UserManageHandler extends Handler {
    async prepare() {
        // 检查是否有系统管理权限
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }
}

// 用户管理主页面处理器
class UserManageMainHandler extends UserManageHandler {
    @param('page', Types.PositiveInt, true)
    @param('search', Types.String, true)
    @param('sort', Types.String, true)
    async get(domainId: string, page = 1, search = '', sort = '_id') {
        const limit = 50;
        const query: any = {};
        
        // 搜索功能
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { uname: searchRegex },
                { mail: searchRegex },
                { _id: isNaN(+search) ? undefined : +search }
            ].filter(Boolean);
        }
        
        // 排序选项
        const sortOptions: Record<string, any> = {
            '_id': { _id: 1 },
            'uname': { uname: 1 },
            'regat': { regat: -1 },
            'loginat': { loginat: -1 },
            'priv': { priv: -1 }
        };
        
        const sortQuery = sortOptions[sort] || { _id: 1 };
        
        // 获取用户列表
        const [udocs, upcount] = await this.paginate(
            UserModel.getMulti(query).sort(sortQuery),
            page,
            limit
        );
        
        // 获取用户在当前域的信息
        const duids = udocs.map(udoc => udoc._id);
        const dudocs = await DomainModel.getMultiUserInDomain(domainId, { uid: { $in: duids } }).toArray();
        const dudocMap = Object.fromEntries(dudocs.map(dudoc => [dudoc.uid, dudoc]));
        
        this.response.template = 'user_manage_main.html';
        this.response.body = {
            udocs,
            dudocMap,
            page,
            upcount,
            search,
            sort,
            canEdit: true,
            moment
        };
    }
}

// 用户详情和编辑处理器
class UserManageDetailHandler extends UserManageHandler {
    @param('uid', Types.Int)
    async get(domainId: string, uid: number) {
        const udoc = await UserModel.getById(domainId, uid);
        if (!udoc) throw new UserNotFoundError(uid);
        
        const dudoc = await DomainModel.getDomainUser(domainId, udoc);
        
        this.response.template = 'user_manage_detail.html';
        this.response.body = {
            udoc,
            dudoc,
            canEdit: true,
            moment
        };
    }
    
    @param('uid', Types.Int)
    @param('operation', Types.String)
    async post(domainId: string, uid: number, operation: string) {
        const udoc = await UserModel.getById(domainId, uid);
        if (!udoc) throw new UserNotFoundError(uid);
        
        if (operation === 'edit') {
            await this.postEdit(domainId, uid);
        } else if (operation === 'resetPassword') {
            await this.postResetPassword(domainId, uid);
        } else if (operation === 'setPriv') {
            await this.postSetPriv(domainId, uid);
        } else if (operation === 'ban') {
            await this.postBan(domainId, uid);
        } else if (operation === 'unban') {
            await this.postUnban(domainId, uid);
        }
        
        this.back();
    }
    
    @param('uid', Types.Int)
    @param('mail', Types.Email, true)
    @param('uname', Types.Username, true)
    @param('school', Types.String, true)
    @param('bio', Types.Content, true)
    async postEdit(domainId: string, uid: number, mail?: string, uname?: string, school?: string, bio?: string) {
        const udoc = await UserModel.getById(domainId, uid);
        if (!udoc) throw new UserNotFoundError(uid);
        
        if (mail && mail !== udoc.mail) {
            // 检查邮箱是否已被使用
            const existing = await UserModel.getByEmail(domainId, mail);
            if (existing && existing._id !== uid) {
                throw new ValidationError('mail', 'Email already in use');
            }
            await UserModel.setEmail(uid, mail);
        }
        
        if (uname && uname !== udoc.uname) {
            // 检查用户名是否已被使用
            const existing = await UserModel.getByUname(domainId, uname);
            if (existing && existing._id !== uid) {
                throw new ValidationError('uname', 'Username already in use');
            }
            await UserModel.setUname(uid, uname);
        }
        
        const updates: any = {};
        if (school !== undefined) updates.school = school;
        if (bio !== undefined) updates.bio = bio;
        
        if (Object.keys(updates).length > 0) {
            await UserModel.setById(uid, updates);
        }
    }
    
    @param('uid', Types.Int)
    @param('password', Types.Password)
    async postResetPassword(domainId: string, uid: number, password: string) {
        const udoc = await UserModel.getById(domainId, uid);
        if (!udoc) throw new UserNotFoundError(uid);
        
        // 不允许重置超级管理员密码（除非当前用户也是超级管理员）
        if (udoc.priv === PRIV.PRIV_ALL && this.user.priv !== PRIV.PRIV_ALL) {
            throw new PermissionError('Cannot reset super admin password');
        }
        
        await UserModel.setPassword(uid, password);
    }
    
    @param('uid', Types.Int)
    @param('priv', Types.Int)
    async postSetPriv(domainId: string, uid: number, priv: number) {
        const udoc = await UserModel.getById(domainId, uid);
        if (!udoc) throw new UserNotFoundError(uid);
        
        // 不允许修改超级管理员权限（除非当前用户也是超级管理员）
        if ((udoc.priv === PRIV.PRIV_ALL || priv === PRIV.PRIV_ALL) && this.user.priv !== PRIV.PRIV_ALL) {
            throw new PermissionError('Cannot modify super admin privileges');
        }
        
        await UserModel.setPriv(uid, priv);
    }
    
    @param('uid', Types.Int)
    async postBan(domainId: string, uid: number) {
        const udoc = await UserModel.getById(domainId, uid);
        if (!udoc) throw new UserNotFoundError(uid);
        
        // 不允许封禁超级管理员
        if (udoc.priv === PRIV.PRIV_ALL) {
            throw new PermissionError('Cannot ban super admin');
        }
        
        await UserModel.ban(uid, 'Banned by administrator');
    }
    
    @param('uid', Types.Int)
    async postUnban(domainId: string, uid: number) {
        const udoc = await UserModel.getById(domainId, uid);
        if (!udoc) throw new UserNotFoundError(uid);
        
        // 恢复为默认权限
        const defaultPriv = await SystemModel.get('default.priv');
        await UserModel.setPriv(uid, defaultPriv);
    }
}



export async function apply(ctx: Context) {
    // 注册路由
    ctx.Route('user_manage_main', '/manage/users', UserManageMainHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('user_manage_detail', '/manage/users/:uid', UserManageDetailHandler, PRIV.PRIV_EDIT_SYSTEM);
    
    // 在控制面板侧边栏添加用户管理菜单项
    ctx.injectUI('ControlPanel', 'user_manage_main', { icon: 'user' });
    
    // 添加国际化支持
    ctx.i18n.load('zh', {
        'user_manage_main': '用户管理',
        'user_manage_detail': '用户详情',

        'User Management': '用户管理',
        'User List': '用户列表',
        'Search Users': '搜索用户',
        'Search by': '搜索方式',
        'Username': '用户名',
        'Email': '邮箱',
        'User ID': '用户ID',
        'Keyword': '关键词',
        'Sort by': '排序方式',
        'Registration Time': '注册时间',
        'Last Login': '最后登录',
        'Privilege': '权限',
        'Order': '顺序',
        'Ascending': '升序',
        'Descending': '降序',
        'Search': '搜索',
        'Clear': '清空',
        'Refresh': '刷新',

        'Normal User': '普通用户',
        'Admin': '管理员',
        'Banned': '已封禁',
        'Super Admin': '超级管理员',
        'Active': '活跃',
        'Inactive': '不活跃',
        'Actions': '操作',
        'View': '查看',
        'Edit': '编辑',
        'Ban': '封禁',
        'Unban': '解封',
        'Set Privilege': '设置权限',
        'Status': '状态',
        'School': '学校',
        'Bio': '个人简介',
        'Never': '从未',
        'Not set': '未设置',
        'Previous': '上一页',
        'Next': '下一页',
        'Page': '页',
        'of': '共',
        'users': '用户',
        'Total': '总计',
        'Showing': '显示',
        'to': '到',
        'User Details': '用户详情',
        'Basic Information': '基本信息',
        'User Statistics': '用户统计',
        'Privilege Management': '权限管理',
        'Password Management': '密码管理',
        'User Status': '用户状态',
        'Back to List': '返回列表',
        'Save Changes': '保存更改',
        'Cancel': '取消',
        'Reset Password': '重置密码',
        'Current Privilege': '当前权限',
        'Ban User': '封禁用户',
        'Unban User': '解封用户',
        'Copy User ID': '复制用户ID'
    });
    
    ctx.i18n.load('en', {
        'user_manage_main': 'User Management',
        'user_manage_detail': 'User Detail',
        'user_manage_batch': 'Batch Operations',
        'User Management': 'User Management',
        'User List': 'User List',
        'Search Users': 'Search Users',
        'Search by': 'Search by',
        'Username': 'Username',
        'Email': 'Email',
        'User ID': 'User ID',
        'Keyword': 'Keyword',
        'Sort by': 'Sort by',
        'Registration Time': 'Registration Time',
        'Last Login': 'Last Login',
        'Privilege': 'Privilege',
        'Order': 'Order',
        'Ascending': 'Ascending',
        'Descending': 'Descending',
        'Search': 'Search',
        'Clear': 'Clear',
        'Refresh': 'Refresh',
        'Batch Operations': 'Batch Operations',
        'Export Users': 'Export Users',
        'Normal User': 'Normal User',
        'Admin': 'Admin',
        'Banned': 'Banned',
        'Super Admin': 'Super Admin',
        'Active': 'Active',
        'Inactive': 'Inactive',
        'Actions': 'Actions',
        'View': 'View',
        'Edit': 'Edit',
        'Ban': 'Ban',
        'Unban': 'Unban',
        'Set Privilege': 'Set Privilege',
        'Status': 'Status',
        'School': 'School',
        'Bio': 'Bio',
        'Never': 'Never',
        'Not set': 'Not set',
        'Previous': 'Previous',
        'Next': 'Next',
        'Page': 'Page',
        'of': 'of',
        'users': 'users',
        'Total': 'Total',
        'Showing': 'Showing',
        'to': 'to',
        'User Details': 'User Details',
        'Basic Information': 'Basic Information',
        'User Statistics': 'User Statistics',
        'Privilege Management': 'Privilege Management',
        'Password Management': 'Password Management',
        'User Status': 'User Status',
        'Back to List': 'Back to List',
        'Save Changes': 'Save Changes',
        'Cancel': 'Cancel',
        'Reset Password': 'Reset Password',
        'Current Privilege': 'Current Privilege',
        'Ban User': 'Ban User',
        'Unban User': 'Unban User',
        'Copy User ID': 'Copy User ID'
    });
}