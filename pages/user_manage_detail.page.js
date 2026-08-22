import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';
import Notification from 'vj/components/notification';
import { request } from 'vj/utils';
import i18n from 'vj/utils/i18n';
import ActionDialog from 'vj/components/dialog/ActionDialog';

const page = new NamedPage('user_manage_detail', () => {
  const uid = window.location.pathname.split('/').pop();
  
  // 编辑用户信息
  $('#edit-user-form').on('submit', async function(e) {
    e.preventDefault();
    
    const formData = {
      operation: 'updateInfo',
      uname: $('#uname').val().trim(),
      email: $('#email').val().trim(),
      school: $('#school').val().trim(),
      bio: $('#bio').val().trim()
    };
    
    // 验证用户名
    if (!formData.uname) {
      Notification.error(i18n('Username cannot be empty'));
      return;
    }
    
    // 验证邮箱
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      Notification.error(i18n('Invalid email format'));
      return;
    }
    
    try {
      const response = await request.post(`/manage/users/${uid}`, formData);
      
      if (response.success) {
        Notification.success(i18n('User information updated successfully'));
        // 更新页面显示
        $('#display-uname').text(formData.uname);
        $('#display-email').text(formData.email);
        $('#display-school').text(formData.school || i18n('Not set'));
        $('#display-bio').text(formData.bio || i18n('Not set'));
      } else {
        Notification.error(response.message || i18n('Update failed'));
      }
    } catch (error) {
      console.error('Error:', error);
      Notification.error(i18n('Update failed'));
    }
  });
  
  // 重置密码
  $('#reset-password').on('click', async function() {
    const username = $('#display-uname').text();
    
    if (!confirm(i18n('Are you sure to reset password for user {0}? A new random password will be generated.', username))) {
      return;
    }
    
    try {
      const response = await request.post(`/manage/users/${uid}`, {
        operation: 'resetPassword'
      });
      
      if (response.success) {
        // 显示新密码
        const dialog = new ActionDialog({
          $body: $(`
            <div class="typo">
              <h3>${i18n('Password Reset Successfully')}</h3>
              <p>${i18n('New password for user {0}:', username)}</p>
              <div class="password-display">
                <input type="text" value="${response.newPassword}" readonly style="width: 100%; font-family: monospace; font-size: 14px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
              </div>
              <p class="text-red">${i18n('Please save this password and inform the user. This password will not be shown again.')}</p>
              <button class="button primary" onclick="navigator.clipboard.writeText('${response.newPassword}'); $(this).text('${i18n('Copied!')}')">${i18n('Copy Password')}</button>
            </div>
          `),
          canCancel: false
        });
        dialog.open();
      } else {
        Notification.error(response.message || i18n('Password reset failed'));
      }
    } catch (error) {
      console.error('Error:', error);
      Notification.error(i18n('Password reset failed'));
    }
  });
  
  // 设置权限
  $('#set-privilege').on('click', async function() {
    const username = $('#display-uname').text();
    const currentPriv = $(this).data('current-priv');
    
    const newPriv = prompt(i18n('Enter new privilege value for user {0}:', username), currentPriv);
    if (newPriv === null || newPriv === '') {
      return;
    }
    
    const privValue = parseInt(newPriv, 10);
    if (isNaN(privValue)) {
      Notification.error(i18n('Invalid privilege value'));
      return;
    }

    // 询问修改天数
    const daysStr = prompt(i18n('Enter duration in days (leave blank for permanent):'), '');
    let days = null;
    if (daysStr !== null && daysStr.trim() !== '') {
      days = parseInt(daysStr, 10);
      if (isNaN(days) || days <= 0) {
        Notification.error(i18n('Invalid days value'));
        return;
      }
    }
    
    if (!confirm(i18n('Are you sure to set privilege of user {0} to {1}?', username, privValue))) {
      return;
    }
    
    try {
      const response = await request.post(`/manage/users/${uid}`, {
        operation: 'setPriv',
        priv: privValue,
        days: days
      });
      
      if (response.success) {
        Notification.success(i18n('Privilege updated successfully'));
        // 更新页面显示
        $('#current-privilege').text(privValue);
        $(this).data('current-priv', privValue);
        
        // 更新权限徽章
        const $badge = $('#privilege-badge');
        $badge.removeClass('success warning alert');
        if (privValue === 0) {
          $badge.addClass('alert').text(i18n('Banned'));
        } else if (privValue === 1) {
          $badge.addClass('success').text(i18n('Normal User'));
        } else {
          $badge.addClass('warning').text(i18n('Admin'));
        }
      } else {
        Notification.error(response.message || i18n('Privilege update failed'));
      }
    } catch (error) {
      console.error('Error:', error);
      Notification.error(i18n('Privilege update failed'));
    }
  });
  
  // 封禁/解封用户
  $('#ban-user, #unban-user').on('click', async function() {
    const username = $('#display-uname').text();
    const action = $(this).attr('id') === 'ban-user' ? 'ban' : 'unban';
    
    const confirmMessage = action === 'ban'
      ? i18n('Are you sure to ban user {0}? This will set their privilege to 0.', username)
      : i18n('Are you sure to unban user {0}? This will restore their privilege to 1.', username);
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    try {
      const response = await request.post(`/manage/users/${uid}`, {
        operation: action
      });
      
      if (response.success) {
        Notification.success(action === 'ban' ? i18n('User banned successfully') : i18n('User unbanned successfully'));
        
        // 更新页面显示
        const newPriv = action === 'ban' ? 0 : 1;
        $('#current-privilege').text(newPriv);
        $('#set-privilege').data('current-priv', newPriv);
        
        // 更新权限徽章
        const $badge = $('#privilege-badge');
        $badge.removeClass('success warning alert');
        if (action === 'ban') {
          $badge.addClass('alert').text(i18n('Banned'));
          $('#ban-user').hide();
          $('#unban-user').show();
        } else {
          $badge.addClass('success').text(i18n('Normal User'));
          $('#ban-user').show();
          $('#unban-user').hide();
        }
      } else {
        Notification.error(response.message || i18n('Operation failed'));
      }
    } catch (error) {
      console.error('Error:', error);
      Notification.error(i18n('Operation failed'));
    }
  });
  
  // 返回用户列表
  $('#back-to-list').on('click', function() {
    window.location.href = '/manage/users';
  });
  
  // 刷新用户信息
  $('#refresh-info').on('click', function() {
    window.location.reload();
  });
  
  // 切换编辑模式
  $('#toggle-edit').on('click', function() {
    const $form = $('#edit-user-form');
    const $display = $('#user-info-display');
    
    if ($form.is(':visible')) {
      $form.hide();
      $display.show();
      $(this).text(i18n('Edit'));
    } else {
      $form.show();
      $display.hide();
      $(this).text(i18n('Cancel'));
    }
  });
  
  // 复制用户ID
  $('#copy-uid').on('click', function() {
    const uid = $(this).data('uid');
    navigator.clipboard.writeText(uid).then(() => {
      Notification.success(i18n('User ID copied to clipboard'));
    }).catch(() => {
      Notification.error(i18n('Failed to copy user ID'));
    });
  });
  
  // 键盘快捷键
  $(document).on('keydown', function(e) {
    // Esc 键取消编辑
    if (e.key === 'Escape' && $('#edit-user-form').is(':visible')) {
      $('#toggle-edit').click();
    }
    
    // Ctrl+S 保存编辑
    if (e.ctrlKey && e.key === 's' && $('#edit-user-form').is(':visible')) {
      e.preventDefault();
      $('#edit-user-form').submit();
    }
  });
  
  // 初始化提示
  $('[data-tooltip]').each(function() {
    $(this).attr('title', $(this).data('tooltip'));
  });
  
  // 表单验证
  $('#uname').on('input', function() {
    const value = $(this).val().trim();
    if (value.length < 3) {
      $(this).addClass('error');
    } else {
      $(this).removeClass('error');
    }
  });
  
  $('#email').on('input', function() {
    const value = $(this).val().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      $(this).addClass('error');
    } else {
      $(this).removeClass('error');
    }
  });
});

export default page;